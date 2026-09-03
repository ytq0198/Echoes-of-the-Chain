import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { evidenceRoot, rawRoot } from './lib/config.mjs';
import { assertSanitizedRecord } from './lib/metrics.mjs';

const runId = (await readFile(join(evidenceRoot, 'latest-run.txt'), 'utf8')).trim();
const root = join(rawRoot, runId);
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (manifest.warmupSeconds !== 10 || manifest.sampleSeconds !== 30 || manifest.repeats !== 3) throw new Error('Latest evidence is not the formal 10/30/3 profile');
if (JSON.stringify(manifest.concurrencies) !== JSON.stringify([1, 5, 10, 20])) throw new Error('Formal concurrency matrix is incomplete');
if (manifest.schedule.length !== 84) throw new Error(`Expected 84 cells, found ${manifest.schedule.length}`);

const files = await readdir(root);
for (const cell of manifest.schedule) {
  const raw = `${cell.cellId}.jsonl`;
  const resource = `${cell.cellId}-resources.csv`;
  if (!files.includes(raw) || !files.includes(resource)) throw new Error(`Missing evidence for ${cell.cellId}`);
  const records = (await readFile(join(root, raw), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  if (!records.length) throw new Error(`Empty evidence for ${cell.cellId}`);
  records.forEach(assertSanitizedRecord);
  if ((await readFile(join(root, resource), 'utf8')).trim().split('\n').length < 2) throw new Error(`Empty resources for ${cell.cellId}`);
}

const auth = JSON.parse(await readFile(join(root, 'auth-controls.json'), 'utf8'));
if (auth.controls.some((item) => !item.passed)) throw new Error('Authentication controls failed');
for (const size of [1, 10, 25, 50]) {
  const control = JSON.parse(await readFile(join(root, `batch-${size}-rollback-control.json`), 'utf8'));
  if (!control.passed) throw new Error(`Batch ${size} rollback control failed`);
}
const audit = JSON.parse(await readFile(join(root, 'ledger-audit.json'), 'utf8'));
if (!audit.passed || audit.matrixInvalidTransactions !== 0) throw new Error('Ledger audit failed or the formal matrix contains invalid transactions');
const faults = JSON.parse(await readFile(join(root, 'faults.json'), 'utf8'));
if (faults.experiments.length !== 3 || faults.experiments.some((item) => !item.recovered || !item.finalLedger?.consistent)) throw new Error('Fault recovery evidence is incomplete');

const evidenceFiles = (await walk(evidenceRoot)).filter((file) => !file.endsWith('checksums.sha256')).sort();
const checksums = [];
for (const file of evidenceFiles) {
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  checksums.push(`${digest}  ${relative(evidenceRoot, file)}`);
}
await writeFile(join(evidenceRoot, 'checksums.sha256'), `${checksums.join('\n')}\n`);
console.log(`Validated 84 formal cells, controls, faults and ledger audit for ${runId}`);

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(target)); else if (entry.isFile()) output.push(target);
  }
  return output;
}
