import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { projectRoot, scheduleForRepeat, seededRandom } from '../lib/config.mjs';
import { assertSanitizedRecord, nearestRank, normalizeError, summarizeRequests } from '../lib/metrics.mjs';

test('nearest-rank percentiles and request summary are deterministic', () => {
  assert.equal(nearestRank([4, 1, 3, 2], 50), 2);
  assert.equal(nearestRank([4, 1, 3, 2], 95), 4);
  assert.deepEqual(summarizeRequests([{ ok: true, latencyMs: 5 }, { ok: false, latencyMs: 9 }], 2), {
    requests: 2,
    successes: 1,
    failures: 1,
    throughput: 0.5,
    failureRate: 0.5,
    p50Ms: 5,
    p95Ms: 5,
    p99Ms: 5,
  });
});

test('repeat schedule rotates all concurrency levels', () => {
  assert.deepEqual(scheduleForRepeat(1), [1, 5, 10, 20]);
  assert.deepEqual(scheduleForRepeat(2), [5, 10, 20, 1]);
  assert.deepEqual(scheduleForRepeat(3), [10, 20, 1, 5]);
});

test('seeded generator is reproducible and produces distinct values', () => {
  const a = seededRandom('fixed');
  const b = seededRandom('fixed');
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  assert.equal(new Set(first).size, first.length);
});

test('raw record guard rejects privacy-sensitive keys', () => {
  assert.doesNotThrow(() => assertSanitizedRecord({ status: 200, errorCode: '' }));
  assert.throws(() => assertSanitizedRecord({ cookie: 'secret' }), /forbidden/);
  assert.throws(() => assertSanitizedRecord({ score: 90 }), /forbidden/);
  assert.equal(normalizeError(undefined, 403, { code: 'ROLE_FORBIDDEN' }), 'ROLE_FORBIDDEN');
});

test('lifecycle scripts never invoke Docker and reset requires confirmation', async () => {
  for (const name of ['benchmark.sh', 'network.sh', 'materials.sh']) {
    const source = await readFile(join(projectRoot, 'infra/benchmark', name), 'utf8');
    assert.doesNotMatch(source, /\bdocker\s+(?:run|compose|stop|rm)\b/i);
    assert.doesNotMatch(source, /\.runtime\/native-fabric/);
  }
  const result = spawnSync(join(projectRoot, 'infra/benchmark/benchmark.sh'), ['reset'], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires --confirm-reset/);
});

test('request schema forbids unknown and sensitive properties', async () => {
  const schema = JSON.parse(await readFile(join(projectRoot, 'infra/benchmark/schemas/request-record.schema.json'), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  for (const key of ['cookie', 'password', 'details', 'score', 'grade', 'hostname', 'path', 'message']) {
    assert.equal(schema.properties[key], undefined);
  }
});
