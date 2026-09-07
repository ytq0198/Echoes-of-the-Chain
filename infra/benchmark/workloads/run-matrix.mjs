import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  apiBase,
  concurrencies as defaultConcurrencies,
  courseHash,
  evidenceRoot,
  projectRoot,
  rawRoot,
  runId as makeRunId,
  runtimeRoot,
  safeId,
  scheduleForRepeat,
  seededRandom,
  sha256,
  studentSubjectHash,
  variants as defaultVariants,
} from '../lib/config.mjs';
import { assertSanitizedRecord, normalizeError, toCsv } from '../lib/metrics.mjs';

const args = new Set(process.argv.slice(2));
const seedOnly = args.has('--seed-only');
const warmupSeconds = numberEnv('BENCHMARK_WARMUP_SECONDS', 10, 0);
const sampleSeconds = numberEnv('BENCHMARK_SAMPLE_SECONDS', 30, 1);
const repeats = numberEnv('BENCHMARK_REPEATS', 3, 1);
const concurrencies = listEnv('BENCHMARK_CONCURRENCIES', defaultConcurrencies, Number);
const variants = listEnv('BENCHMARK_VARIANTS', defaultVariants, String);
const id = process.env.BENCHMARK_RUN_ID || makeRunId();
const seed = process.env.BENCHMARK_SEED || 'chaingrade-benchmark-v1';
const runRoot = join(rawRoot, id);
const secrets = await loadSecrets();
const sessions = {};

await mkdir(runRoot, { recursive: true });
await writeFile(join(runtimeRoot, 'current-run-id'), `${id}\n`, { mode: 0o600 });

for (const role of ['issuer', 'reviewer', 'student']) sessions[role] = await login(role);
await runAuthControls();
const credentialPool = await seedCredentials(32);
await writeFile(join(runRoot, 'credential-pool.json'), `${JSON.stringify({ schemaVersion: 1, credentialIds: credentialPool }, null, 2)}\n`);

if (seedOnly) {
  console.log(`Seeded ${credentialPool.length} ACTIVE synthetic credentials for ${id}`);
  process.exit(0);
}

const manifest = {
  schemaVersion: 1,
  runId: id,
  platform: 'current-wsl-authorized-substitute',
  seed,
  warmupSeconds,
  sampleSeconds,
  repeats,
  concurrencies,
  variants,
  schedule: [],
  initialLedger: ledgerInfo(),
  startedAt: new Date().toISOString(),
};

for (const variant of variants) {
  if (variant.startsWith('batch-')) await runBatchRollbackControl(Number(variant.slice(6)));
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    const schedule = scheduleForRepeat(repeat).filter((value) => concurrencies.includes(value));
    for (const concurrency of schedule) {
      const cellId = safeId(`${variant}-c${concurrency}-r${repeat}`);
      console.log(`CELL ${cellId}: warmup=${warmupSeconds}s sample=${sampleSeconds}s`);
      manifest.schedule.push({ cellId, variant, concurrency, repeat });
      if (warmupSeconds > 0) await runPhase({ variant, concurrency, repeat, cellId, phase: 'warmup', seconds: warmupSeconds, credentialPool });
      const resourcePromise = sampleResources(cellId, sampleSeconds);
      const records = await runPhase({ variant, concurrency, repeat, cellId, phase: 'sample', seconds: sampleSeconds, credentialPool });
      await resourcePromise;
      for (const record of records) assertSanitizedRecord(record);
      await writeFile(join(runRoot, `${cellId}.jsonl`), `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
    }
  }
}

manifest.finishedAt = new Date().toISOString();
manifest.finalLedger = ledgerInfo();
await writeFile(join(runRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(evidenceRoot, 'latest-run.txt'), `${id}\n`);
console.log(`Completed ${manifest.schedule.length} formal cells in ${runRoot.replace(`${projectRoot}/`, '')}`);

async function login(role) {
  const upper = role.toUpperCase();
  const response = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: `benchmark-${role}`, password: secrets[`API_${upper}_PASSWORD`] }),
  });
  if (!response.ok) throw new Error(`Login failed for ${role}: HTTP ${response.status}`);
  const body = await response.json();
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie || !body.csrfToken) throw new Error(`Login did not return session material for ${role}`);
  return { cookie: setCookie.split(';', 1)[0], csrf: body.csrfToken };
}

async function runAuthControls() {
  const target = 'cred:benchmark:auth-control-missing';
  const unauthenticated = await rawRequest('GET', `/api/v1/credentials/${target}/private-details`);
  const wrongRole = await rawRequest('GET', `/api/v1/credentials/${target}/private-details`, undefined, sessions.issuer);
  const controls = [
    { name: 'private-query-without-session', expectedStatus: 401, actualStatus: unauthenticated.status },
    { name: 'private-query-wrong-role', expectedStatus: 403, actualStatus: wrongRole.status },
  ].map((item) => ({ ...item, passed: item.expectedStatus === item.actualStatus }));
  await writeFile(join(runRoot, 'auth-controls.json'), `${JSON.stringify({ schemaVersion: 1, controls }, null, 2)}\n`);
  if (controls.some((item) => !item.passed)) throw new Error('Authentication control probes failed');
}

async function seedCredentials(count) {
  const ids = Array.from({ length: count }, (_, index) => `cred:bench:${id}:seed:${String(index).padStart(3, '0')}`);
  const created = await Promise.all(ids.map((credentialId, index) => rawRequest('POST', '/api/v1/credentials/drafts', credentialBody(credentialId, `seed-${index}`), sessions.issuer)));
  if (created.some((response) => response.status !== 201)) throw new Error(`Seed draft failed: ${created.map((response) => response.status).join(',')}`);
  const approved = await Promise.all(ids.map((credentialId) => rawRequest('POST', `/api/v1/credentials/${credentialId}/approve`, undefined, sessions.reviewer)));
  if (approved.some((response) => response.status !== 200 || response.body.status !== 'ACTIVE')) throw new Error(`Seed approval failed: ${approved.map((response) => response.status).join(',')}`);
  return ids;
}

async function runBatchRollbackControl(size) {
  const prefix = `cred:bench:${id}:rollback:b${size}`;
  const existingId = `${prefix}:existing`;
  let response = await rawRequest('POST', '/api/v1/credentials/drafts', credentialBody(existingId, 'rollback-existing'), sessions.issuer);
  if (response.status !== 201) throw new Error(`Rollback setup failed for batch ${size}`);
  const before = ledgerInfo();
  const rows = Array.from({ length: size }, (_, index) => credentialBody(index === 0 ? existingId : `${prefix}:new:${index}`, `rollback-${size}-${index}`));
  response = await rawRequest('POST', '/api/v1/credentials/imports', { rows }, sessions.issuer);
  const after = ledgerInfo();
  const absentChecks = await Promise.all(rows.slice(1).map((row) => rawRequest('GET', `/api/v1/credentials/${row.credentialId}`)));
  const passed = response.status === 409 && heightOf(before) === heightOf(after) && absentChecks.every((item) => item.status === 404);
  const result = { schemaVersion: 1, batchSize: size, expectedStatus: 409, actualStatus: response.status, heightBefore: heightOf(before), heightAfter: heightOf(after), newItemsAbsent: absentChecks.every((item) => item.status === 404), passed };
  await writeFile(join(runRoot, `batch-${size}-rollback-control.json`), `${JSON.stringify(result, null, 2)}\n`);
  if (!passed) throw new Error(`Atomic rollback control failed for batch ${size}`);
}

async function runPhase(context) {
  const deadline = performance.now() + context.seconds * 1000;
  let sequence = 0;
  const workers = Array.from({ length: context.concurrency }, (_, worker) => (async () => {
    const output = [];
    const random = seededRandom(`${seed}:${context.cellId}:${context.phase}:${worker}`);
    while (performance.now() < deadline) {
      const current = sequence++;
      output.push(...await executeOperation(context, worker, current, random));
    }
    return output;
  })());
  const records = (await Promise.all(workers)).flat();
  return context.phase === 'sample' ? records : [];
}

async function executeOperation(context, worker, sequence, random) {
  const base = { schemaVersion: 1, runId: id, cellId: context.cellId, variant: context.variant, phase: context.phase, concurrency: context.concurrency, repeat: context.repeat, worker, sequence };
  if (context.variant === 'public-verify') {
    const credentialId = context.credentialPool[Math.floor(random() * context.credentialPool.length)];
    return [await measuredRequest(base, 'verify', 'GET', `/api/v1/credentials/${credentialId}/verify`)];
  }
  if (context.variant === 'student-private') {
    const credentialId = context.credentialPool[Math.floor(random() * context.credentialPool.length)];
    return [await measuredRequest(base, 'private-query', 'GET', `/api/v1/credentials/${credentialId}/private-details`, undefined, sessions.student)];
  }
  const prefix = safeId(`${id}-${context.cellId}-${context.phase}-w${worker}-n${sequence}`);
  if (context.variant === 'issue-review') {
    const credentialId = `cred:bench:${prefix}`;
    const start = performance.now();
    const draft = await measuredRequest(base, 'draft', 'POST', '/api/v1/credentials/drafts', credentialBody(credentialId, prefix), sessions.issuer);
    if (!draft.ok) return [{ ...draft, logicalStartedAt: draft.startedAt, logicalLatencyMs: round(performance.now() - start) }];
    const approve = await measuredRequest(base, 'approve', 'POST', `/api/v1/credentials/${credentialId}/approve`, undefined, sessions.reviewer);
    return [draft, { ...approve, logicalStartedAt: draft.startedAt, logicalLatencyMs: round(performance.now() - start) }];
  }
  const size = Number(context.variant.slice(6));
  const rows = Array.from({ length: size }, (_, index) => credentialBody(`cred:bench:${prefix}:i${index}`, `${prefix}-${index}`));
  return [await measuredRequest(base, 'batch-submit', 'POST', '/api/v1/credentials/imports', { rows }, sessions.issuer, { batchSize: size })];
}

async function measuredRequest(base, stage, method, path, body, session, extra = {}) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const response = await rawRequest(method, path, body, session);
  return {
    ...base,
    ...extra,
    stage,
    startedAt,
    completedAt: new Date().toISOString(),
    latencyMs: round(performance.now() - start),
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    errorCode: response.status >= 200 && response.status < 300 ? '' : response.code,
    transactionId: response.body && typeof response.body.transactionId === 'string' ? response.body.transactionId : '',
  };
}

async function rawRequest(method, path, body, session) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session) {
    headers.cookie = session.cookie;
    if (method !== 'GET') headers['x-csrf-token'] = session.csrf;
  }
  try {
    const response = await fetch(`${apiBase}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(75_000) });
    let result = {};
    try { result = await response.json(); } catch {}
    return { status: response.status, body: result, code: normalizeError(undefined, response.status, result) };
  } catch (error) {
    return { status: 0, body: {}, code: normalizeError(error) };
  }
}

function credentialBody(credentialId, saltSeed) {
  return { credentialId, subjectHash: studentSubjectHash, courseHash, schemaVersion: '1.0', details: { courseName: 'Synthetic Course', score: 90, grade: 'A', salt: sha256(`salt:${saltSeed}`) } };
}

async function sampleResources(cellId, seconds) {
  const columns = ['timestamp', 'component', 'pid', 'cpuPct', 'rssMiB', 'readBytes', 'writeBytes'];
  const rows = [];
  const previous = new Map();
  let previousSystem;
  const end = Date.now() + seconds * 1000;
  while (Date.now() <= end) {
    for (const component of ['orderer', 'peer0.org1', 'peer0.org2', 'ccaas', 'api']) {
      try {
        const pid = Number((await readFile(join(runtimeRoot, 'pids', `${component}.pid`), 'utf8')).trim());
        const sample = await processSample(pid);
        const prior = previous.get(component);
        const cpuPct = prior ? ((sample.ticks - prior.ticks) / 100 / ((sample.time - prior.time) / 1000)) * 100 : 0;
        rows.push({ timestamp: new Date().toISOString(), component, pid, cpuPct: round(cpuPct), rssMiB: round(sample.rssKiB / 1024), readBytes: sample.readBytes, writeBytes: sample.writeBytes });
        previous.set(component, sample);
      } catch {}
    }
    try {
      const sample = await systemSample();
      const cpuPct = previousSystem ? ((sample.busy - previousSystem.busy) / (sample.total - previousSystem.total)) * 100 : 0;
      rows.push({ timestamp: new Date().toISOString(), component: 'system', pid: '', cpuPct: round(cpuPct), rssMiB: round(sample.usedKiB / 1024), readBytes: '', writeBytes: '' });
      previousSystem = sample;
    } catch {}
    await delay(1000);
  }
  await writeFile(join(runRoot, `${cellId}-resources.csv`), toCsv(rows, columns));
}

async function systemSample() {
  const [stat, meminfo] = await Promise.all([readFile('/proc/stat', 'utf8'), readFile('/proc/meminfo', 'utf8')]);
  const cpu = stat.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const total = cpu.reduce((sum, value) => sum + value, 0);
  const idle = (cpu[3] ?? 0) + (cpu[4] ?? 0);
  const value = (key) => Number(meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? 0);
  return { total, busy: total - idle, usedKiB: value('MemTotal') - value('MemAvailable') };
}

async function processSample(pid) {
  const [stat, status, io] = await Promise.all([readFile(`/proc/${pid}/stat`, 'utf8'), readFile(`/proc/${pid}/status`, 'utf8'), readFile(`/proc/${pid}/io`, 'utf8')]);
  const close = stat.lastIndexOf(')');
  const fields = stat.slice(close + 2).split(' ');
  const value = (text, pattern) => Number(text.match(pattern)?.[1] ?? 0);
  return { time: Date.now(), ticks: Number(fields[11]) + Number(fields[12]), rssKiB: value(status, /^VmRSS:\s+(\d+)/m), readBytes: value(io, /^read_bytes:\s+(\d+)/m), writeBytes: value(io, /^write_bytes:\s+(\d+)/m) };
}

function ledgerInfo() {
  return JSON.parse(execFileSync(join(projectRoot, 'infra/benchmark/network.sh'), ['ledger-info'], { cwd: projectRoot, encoding: 'utf8' }));
}

function heightOf(info) { return Number(info.org1?.height ?? 0); }
function round(value) { return Math.round(value * 1000) / 1000; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function loadSecrets() {
  const text = await readFile(join(runtimeRoot, 'secrets.env'), 'utf8');
  return Object.fromEntries(text.trim().split('\n').map((line) => line.split('=', 2)));
}

function numberEnv(name, fallback, minimum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}

function listEnv(name, fallback, converter) {
  return process.env[name] ? process.env[name].split(',').map(converter) : [...fallback];
}
