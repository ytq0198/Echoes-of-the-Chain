import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { evidenceRoot, projectRoot, rawRoot, runtimeRoot } from './lib/config.mjs';

const runId = (process.env.BENCHMARK_RUN_ID || (await readFile(join(evidenceRoot, 'latest-run.txt'), 'utf8'))).trim();
const runRoot = join(rawRoot, runId);
const manifest = JSON.parse(await readFile(join(runRoot, 'manifest.json'), 'utf8'));
const startHeight = Number(process.env.BENCHMARK_AUDIT_START_HEIGHT ?? manifest.initialLedger.org1.height);
const currentLedger = JSON.parse(execFileSync(join(projectRoot, 'infra/benchmark/network.sh'), ['ledger-info'], { cwd: projectRoot, encoding: 'utf8' }));
const endHeight = Number(process.env.BENCHMARK_AUDIT_END_HEIGHT ?? currentLedger.org1.height);
const auditRoot = join(runtimeRoot, 'audit');
await mkdir(auditRoot, { recursive: true });

const peer = join(projectRoot, '.tools/fabric-samples/bin/peer');
const decoder = join(projectRoot, '.tools/fabric-samples/bin/configtxlator');
const orgRoot = join(runtimeRoot, 'organizations');
const org1 = join(orgRoot, 'peerOrganizations/org1.example.com');
const env = {
  ...process.env,
  FABRIC_CFG_PATH: join(projectRoot, '.tools/fabric-samples/config'),
  CORE_PEER_LOCALMSPID: 'Org1MSP',
  CORE_PEER_MSPCONFIGPATH: join(org1, 'users/Admin@org1.example.com/msp'),
  CORE_PEER_ADDRESS: 'localhost:17051',
  CORE_PEER_TLS_ENABLED: 'true',
  CORE_PEER_TLS_ROOTCERT_FILE: join(org1, 'peers/peer0.org1.example.com/tls/ca.crt'),
};

let validTransactions = 0;
let invalidTransactions = 0;
let unexplainedTransactions = 0;
const invalidByCode = {};
const invalidDetails = [];
const explainedCodes = { 11: 'MVCC_READ_CONFLICT' };
for (let block = startHeight; block < endHeight; block += 1) {
  const blockFile = join(auditRoot, `block-${block}.pb`);
  const blockJson = join(auditRoot, `block-${block}.json`);
  if (process.env.BENCHMARK_AUDIT_REUSE_CACHE !== 'true') {
    const blockHex = execFileSync(peer, ['chaincode', 'query', '-C', 'chaingrade-benchmark', '-n', 'qscc', '-c', JSON.stringify({ Args: ['GetBlockByNumber', 'chaingrade-benchmark', String(block)] }), '--hex'], { env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim();
    if (!/^[a-f0-9]+$/i.test(blockHex)) throw new Error(`QSCC returned non-hex data for block ${block}`);
    await writeFile(blockFile, Buffer.from(blockHex, 'hex'));
    execFileSync(decoder, ['proto_decode', '--input', blockFile, '--type', 'common.Block', '--output', blockJson]);
  }
  const decoded = JSON.parse(await readFile(blockJson, 'utf8'));
  const transactions = decoded.data?.data?.length ?? 0;
  const encodedMetadata = decoded.metadata?.metadata?.[2];
  if (!encodedMetadata) {
    unexplainedTransactions += transactions;
    continue;
  }
  const flags = [...Buffer.from(encodedMetadata, 'base64')];
  if (flags.length !== transactions) unexplainedTransactions += Math.abs(flags.length - transactions);
  for (const [txIndex, flag] of flags.slice(0, transactions).entries()) {
    if (flag === 0) validTransactions += 1;
    else {
      invalidTransactions += 1;
      invalidByCode[String(flag)] = (invalidByCode[String(flag)] ?? 0) + 1;
      const channelHeader = decoded.data?.data?.[txIndex]?.payload?.header?.channel_header;
      invalidDetails.push({ block, txIndex, code: flag, name: explainedCodes[flag] ?? 'UNKNOWN_VALIDATION_CODE', transactionId: channelHeader?.tx_id ?? '', timestamp: channelHeader?.timestamp ?? '' });
    }
  }
}

const unknownInvalidTransactions = invalidDetails.filter((item) => item.name === 'UNKNOWN_VALIDATION_CODE').length;
const matrixEndHeight = Number(manifest.finalLedger.org1.height);
const matrixInvalidTransactions = invalidDetails.filter((item) => item.block < matrixEndHeight).length;
const postMatrixInvalidTransactions = invalidDetails.length - matrixInvalidTransactions;

const result = {
  schemaVersion: 1,
  runId,
  startHeight,
  endHeight,
  blocksInspected: Math.max(0, endHeight - startHeight),
  validTransactions,
  invalidTransactions,
  explainedInvalidTransactions: invalidTransactions - unknownInvalidTransactions,
  unknownInvalidTransactions,
  matrixEndHeight,
  matrixInvalidTransactions,
  postMatrixInvalidTransactions,
  unexplainedTransactions,
  invalidByCode,
  invalidDetails,
  source: 'Org1 Peer QSCC validated blocks',
  finalLedger: currentLedger,
  passed: unknownInvalidTransactions === 0 && unexplainedTransactions === 0 && currentLedger.consistent === true,
};
await writeFile(join(runRoot, 'ledger-audit.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
