import { access, mkdir, realpath, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { ports, projectRoot, runtimeRoot } from './lib/config.mjs';

const required = [
  '.tools/node/bin/node',
  '.tools/fabric-samples/bin/peer',
  '.tools/fabric-samples/bin/orderer',
  '.tools/fabric-samples/bin/osnadmin',
  '.tools/fabric-samples/bin/configtxgen',
  '.tools/fabric-samples/bin/configtxlator',
  '.tools/fabric-samples/bin/fabric-ca-server',
  '.tools/fabric-samples/bin/fabric-ca-client',
];

let failures = 0;
for (const relative of required) {
  try {
    await access(join(projectRoot, relative), constants.X_OK);
    console.log(`OK executable ${relative}`);
  } catch {
    console.error(`FAIL executable ${relative}`);
    failures += 1;
  }
}

await mkdir(runtimeRoot, { recursive: true });
const actualRoot = await realpath(runtimeRoot);
if (actualRoot !== runtimeRoot || runtimeRoot.includes('/native-fabric')) {
  console.error(`FAIL unsafe benchmark runtime root: ${actualRoot}`);
  failures += 1;
} else {
  console.log('OK isolated runtime .runtime/benchmark');
}

const fs = await statfs(projectRoot);
const freeGiB = Number(fs.bavail * fs.bsize) / 1024 ** 3;
if (freeGiB < 10) {
  console.error(`FAIL free disk ${freeGiB.toFixed(1)} GiB is below 10 GiB`);
  failures += 1;
} else console.log(`OK free disk ${freeGiB.toFixed(1)} GiB`);

const meminfo = spawnSync('sh', ['-c', "awk '/MemTotal/ {print $2}' /proc/meminfo"], { encoding: 'utf8' });
const memoryGiB = Number(meminfo.stdout.trim()) / 1024 ** 2;
if (memoryGiB < 4) {
  console.error(`FAIL memory ${memoryGiB.toFixed(1)} GiB is below 4 GiB`);
  failures += 1;
} else console.log(`OK memory ${memoryGiB.toFixed(1)} GiB`);

if (process.env.CHAINGRADE_ALLOW_MANAGED_PORTS !== 'true') {
  for (const [name, port] of Object.entries(ports)) {
    const free = await portIsFree(port);
    if (!free) {
      console.error(`FAIL port ${port} (${name}) is occupied`);
      failures += 1;
    } else console.log(`OK port ${port} (${name})`);
  }
}

const git = spawnSync('git', ['status', '--short'], { cwd: projectRoot, encoding: 'utf8' });
console.log(`INFO git worktree ${git.stdout.trim() ? 'has local changes (recorded, not rejected)' : 'clean'}`);
console.log('OK evidence policy forbids Cookie, password, private details, hostname and absolute paths');

if (failures) {
  console.error(`Benchmark preflight failed with ${failures} issue(s).`);
  process.exitCode = 1;
} else console.log('Benchmark preflight passed without Docker access.');

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port }, () => server.close(() => resolve(true)));
  });
}
