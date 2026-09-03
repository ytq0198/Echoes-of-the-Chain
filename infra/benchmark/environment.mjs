import { execFileSync } from 'node:child_process';
import { cpus, freemem, totalmem } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { evidenceRoot, projectRoot } from './lib/config.mjs';

const phase = process.argv[2] ?? 'before';
await mkdir(evidenceRoot, { recursive: true });
const target = join(evidenceRoot, 'environment.json');
let existing = {};
try { existing = JSON.parse(await readFile(target, 'utf8')); } catch {}

const run = (command, args, options = {}) => execFileSync(command, args, { cwd: projectRoot, encoding: 'utf8', ...options }).trim();
let ledger = null;
try { ledger = JSON.parse(run(join(projectRoot, 'infra/benchmark/network.sh'), ['ledger-info'])); } catch {}
let definition = '';
try {
  const root = join(projectRoot, '.runtime/benchmark/organizations/peerOrganizations/org1.example.com');
  definition = run(join(projectRoot, '.tools/fabric-samples/bin/peer'), ['lifecycle', 'chaincode', 'querycommitted', '--channelID', 'chaingrade-benchmark', '--name', 'grade'], {
    env: { ...process.env, FABRIC_CFG_PATH: join(projectRoot, '.tools/fabric-samples/config'), CORE_PEER_LOCALMSPID: 'Org1MSP', CORE_PEER_MSPCONFIGPATH: join(root, 'users/Admin@org1.example.com/msp'), CORE_PEER_ADDRESS: 'localhost:17051', CORE_PEER_TLS_ENABLED: 'true', CORE_PEER_TLS_ROOTCERT_FILE: join(root, 'peers/peer0.org1.example.com/tls/ca.crt') },
  });
} catch {}

const cpu = cpus()[0]?.model.replace(/\s+/g, ' ').trim() ?? 'unknown';
const release = (await readFile('/proc/sys/kernel/osrelease', 'utf8')).trim();
const snapshot = {
  capturedAt: new Date().toISOString(),
  gitCommit: run('git', ['rev-parse', 'HEAD']),
  gitDirty: Boolean(run('git', ['status', '--short'])),
  platform: 'current-wsl-authorized-substitute',
  os: { family: 'Linux', wsl: /microsoft/i.test(release), kernelRelease: release },
  cpu: { model: cpu, logicalCores: cpus().length },
  memory: { totalGiB: round(totalmem() / 1024 ** 3), freeGiBAtCapture: round(freemem() / 1024 ** 3) },
  versions: {
    node: process.version,
    peer: firstLine(run(join(projectRoot, '.tools/fabric-samples/bin/peer'), ['version'])),
    orderer: firstLine(run(join(projectRoot, '.tools/fabric-samples/bin/orderer'), ['version'])),
  },
  chaincode: { name: 'grade', expectedSequence: 1, committedDefinition: definition },
  ledger,
};
const output = { schemaVersion: 1, note: 'Measured on the current WSL environment, not the originally designated server.', ...existing, [phase]: snapshot };
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`);

function firstLine(text) { return text.split('\n').find((line) => line.trim().startsWith('Version:'))?.trim() ?? text.split('\n')[0]; }
function round(value) { return Math.round(value * 100) / 100; }
