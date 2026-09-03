import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const benchmarkDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const projectRoot = resolve(benchmarkDir, '../..');
export const runtimeRoot = resolve(projectRoot, '.runtime/benchmark');
export const evidenceRoot = resolve(projectRoot, 'reports/assets/iteration-14-benchmark');
export const rawRoot = join(evidenceRoot, 'raw');
export const apiBase = 'http://127.0.0.1:17300';
export const studentSubjectHash = sha256('benchmark-synthetic-student-v1');
export const courseHash = sha256('benchmark-synthetic-course-v1');

export const ports = Object.freeze({
  orderer: 17050,
  ordererAdmin: 17053,
  ordererOps: 19443,
  org1Peer: 17051,
  org1Chaincode: 17052,
  org1Ops: 19444,
  org2Peer: 19051,
  org2Chaincode: 19052,
  org2Ops: 19445,
  org1Ca: 17054,
  org2Ca: 19054,
  ordererCa: 17055,
  org1CaOps: 19543,
  org2CaOps: 19544,
  ordererCaOps: 19545,
  ccaas: 19999,
  api: 17300,
});

export const variants = Object.freeze([
  'public-verify',
  'student-private',
  'issue-review',
  'batch-1',
  'batch-10',
  'batch-25',
  'batch-50',
]);
export const concurrencies = Object.freeze([1, 5, 10, 20]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function runId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function safeId(value) {
  return value.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 96);
}

export function seededRandom(seed) {
  let state = Number.parseInt(sha256(seed).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function scheduleForRepeat(repeat) {
  const offset = (repeat - 1) % concurrencies.length;
  return concurrencies.map((_, index) => concurrencies[(index + offset) % concurrencies.length]);
}
