import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'deliverables/competition');
const textExtensions = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.html', '.xml', '.svg']);
const forbidden = [
  ['school name', /浙江大学/giu],
  ['team member name', /(魏子安|强璞|阳震)/gu],
  ['personal GitHub identity', /(?:github\.com\/ytq0198|ytq0198@users\.noreply\.github\.com)/giu],
  ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu],
];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

try {
  if (!(await stat(root)).isDirectory()) throw new Error(`${root} is not a directory`);
  const findings = [];
  for (const file of await walk(root)) {
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/u);
    for (const [label, pattern] of forbidden) {
      pattern.lastIndex = 0;
      for (let index = 0; index < lines.length; index += 1) {
        pattern.lastIndex = 0;
        if (pattern.test(lines[index])) {
          findings.push(`${path.relative(process.cwd(), file)}:${index + 1} ${label}`);
        }
      }
    }
  }
  if (findings.length > 0) {
    console.error('Anonymous submission check failed:');
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
  } else {
    console.log(`Anonymous submission check passed: ${path.relative(process.cwd(), root)}`);
  }
} catch (error) {
  console.error(`Anonymous submission check could not run: ${error.message}`);
  process.exitCode = 2;
}
