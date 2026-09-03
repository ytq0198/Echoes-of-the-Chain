import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { apiBase, evidenceRoot, projectRoot, rawRoot, runtimeRoot, sha256, studentSubjectHash, courseHash } from './lib/config.mjs';
import { normalizeError } from './lib/metrics.mjs';

const runId = (process.env.BENCHMARK_RUN_ID || (await readFile(join(evidenceRoot, 'latest-run.txt'), 'utf8'))).trim();
const runRoot = join(rawRoot, runId);
const pool = JSON.parse(await readFile(join(runRoot, 'credential-pool.json'), 'utf8')).credentialIds;
const secrets = Object.fromEntries((await readFile(join(runtimeRoot, 'secrets.env'), 'utf8')).trim().split('\n').map((line) => line.split('=', 2)));
const issuer = await login('issuer');
const reviewer = await login('reviewer');
const healthySeconds = numberEnv('BENCHMARK_FAULT_HEALTHY_SECONDS', 10);
const outageSeconds = numberEnv('BENCHMARK_FAULT_OUTAGE_SECONDS', 20);
const recoverySeconds = numberEnv('BENCHMARK_FAULT_RECOVERY_SECONDS', 120);
const faultRunId = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '').replace('Z', '');
let probeSequence = 0;
const results = [];

for (const fault of [
  { name: 'org2-peer', stop: 'stop-peer2', start: 'start-peer2', expected: 'API remains available through Org1; Org2 catches up after restart.' },
  { name: 'ccaas', stop: 'stop-ccaas', start: 'start-ccaas', expected: 'Chaincode reads and writes fail; new requests recover after restart.' },
  { name: 'orderer', stop: 'stop-orderer', start: 'start-orderer', expected: 'Reads continue but writes fail because the topology has one orderer.' },
]) results.push(await runFault(fault));

await writeFile(join(runRoot, 'faults.json'), `${JSON.stringify({ schemaVersion: 1, runId, faultRunId, experiments: results }, null, 2)}\n`);
if (results.some((result) => !result.recovered || !result.finalLedger?.consistent)) process.exitCode = 1;

async function runFault(fault) {
  console.log(`FAULT ${fault.name}: healthy window`);
  const started = Date.now();
  const probes = [];
  await probeWindow(fault.name, 'healthy', healthySeconds, probes);
  const stoppedAt = new Date().toISOString();
  network(fault.stop);
  console.log(`FAULT ${fault.name}: outage window`);
  await probeWindow(fault.name, 'outage', outageSeconds, probes);
  const restartedAt = new Date().toISOString();
  network(fault.start);
  console.log(`FAULT ${fault.name}: recovery window`);
  let stable = 0;
  let firstRecoveredAt = null;
  let stableRecoveredAt = null;
  const recoveryDeadline = Date.now() + recoverySeconds * 1000;
  while (Date.now() < recoveryDeadline && stable < 3) {
    const pair = await probePair(fault.name, 'recovery', probes);
    const ledger = safeLedgerInfo();
    if (pair.every((probe) => probe.ok) && ledger?.consistent) {
      firstRecoveredAt ??= new Date().toISOString();
      stable += 1;
      if (stable === 3) stableRecoveredAt = new Date().toISOString();
    } else stable = 0;
    await delay(1000);
  }
  const finalLedger = safeLedgerInfo();
  const result = {
    name: fault.name,
    expected: fault.expected,
    startedAt: new Date(started).toISOString(),
    stoppedAt,
    restartedAt,
    firstRecoveredAt,
    stableRecoveredAt,
    recoveryMs: stableRecoveredAt ? Date.parse(stableRecoveredAt) - Date.parse(restartedAt) : null,
    recovered: stable === 3,
    errorCounts: countErrors(probes),
    probes,
    finalLedger,
  };
  await writeFile(join(runRoot, `fault-${fault.name}.json`), `${JSON.stringify({ schemaVersion: 1, ...result }, null, 2)}\n`);
  return result;
}

async function probeWindow(fault, phase, seconds, target) {
  const end = Date.now() + seconds * 1000;
  const active = new Set();
  while (Date.now() < end) {
    if (active.size < 5) {
      const work = probePair(fault, phase, target).finally(() => active.delete(work));
      active.add(work);
    }
    await delay(1000);
  }
  await Promise.allSettled(active);
}

async function probePair(fault, phase, target) {
  const sequence = probeSequence++;
  const id = `cred:bench:${runId}:fault:${faultRunId}:${fault}:${phase}:${sequence}`;
  const [read, write] = await Promise.all([
    timed('read', fault, phase, () => request('GET', `/api/v1/credentials/${pool[sequence % pool.length]}/verify`)),
    timed('write', fault, phase, async () => {
      const draft = await request('POST', '/api/v1/credentials/drafts', credentialBody(id, id), issuer);
      if (!draft.ok) return draft;
      return request('POST', `/api/v1/credentials/${id}/approve`, undefined, reviewer);
    }),
  ]);
  target.push(read, write);
  return [read, write];
}

async function timed(kind, fault, phase, operation) {
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const response = await operation();
  return { fault, phase, kind, startedAt, latencyMs: Math.round((performance.now() - start) * 1000) / 1000, ok: response.ok, status: response.status, errorCode: response.ok ? '' : response.code, transactionId: response.transactionId ?? '' };
}

async function request(method, path, body, session) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (session) { headers.cookie = session.cookie; if (method !== 'GET') headers['x-csrf-token'] = session.csrf; }
  try {
    const response = await fetch(`${apiBase}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8_000) });
    let result = {};
    try { result = await response.json(); } catch {}
    return { ok: response.ok, status: response.status, code: normalizeError(undefined, response.status, result), transactionId: typeof result.transactionId === 'string' ? result.transactionId : '' };
  } catch (error) { return { ok: false, status: 0, code: normalizeError(error) }; }
}

async function login(role) {
  const response = await fetch(`${apiBase}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `benchmark-${role}`, password: secrets[`API_${role.toUpperCase()}_PASSWORD`] }) });
  if (!response.ok) throw new Error(`Fault driver login failed for ${role}`);
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';', 1)[0], csrf: body.csrfToken };
}

function credentialBody(credentialId, saltSeed) {
  return { credentialId, subjectHash: studentSubjectHash, courseHash, schemaVersion: '1.0', details: { courseName: 'Synthetic Course', score: 90, grade: 'A', salt: sha256(`fault-salt:${saltSeed}`) } };
}

function network(command) { execFileSync(join(projectRoot, 'infra/benchmark/network.sh'), [command], { cwd: projectRoot, stdio: 'inherit' }); }
function safeLedgerInfo() { try { return JSON.parse(execFileSync(join(projectRoot, 'infra/benchmark/network.sh'), ['ledger-info'], { cwd: projectRoot, encoding: 'utf8' })); } catch { return null; } }
function countErrors(probes) { const counts = {}; for (const probe of probes) if (!probe.ok) counts[probe.errorCode] = (counts[probe.errorCode] ?? 0) + 1; return counts; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function numberEnv(name, fallback) { const value = Number(process.env[name] ?? fallback); if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`); return value; }
