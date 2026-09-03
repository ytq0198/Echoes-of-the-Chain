import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

import { evidenceRoot, projectRoot } from './lib/config.mjs';

const allowed = new Set(['.json', '.jsonl', '.csv', '.md', '.svg', '.txt']);
const patterns = [
  ['absolute user path', /\/(?:home|Users)\/[A-Za-z0-9._-]+\//],
  ['session cookie', /(?:set-cookie|cookie)["']?\s*[:=]/i],
  ['password field', /["']password["']\s*:/i],
  ['private score', /["']score["']\s*:/i],
  ['private grade', /["']grade["']\s*:/i],
  ['hostname field', /["']hostname["']\s*:/i],
];
const findings = [];
for (const file of await walk(evidenceRoot)) {
  if (!allowed.has(extname(file))) continue;
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [label, pattern] of patterns) if (pattern.test(line)) findings.push(`${relative(projectRoot, file)}:${index + 1} ${label}`);
  });
}
if (findings.length) {
  console.error(`Benchmark privacy check failed:\n${findings.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('Benchmark privacy check passed.');

async function walk(root) {
  try { if (!(await stat(root)).isDirectory()) return []; } catch { return []; }
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walk(target));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}
