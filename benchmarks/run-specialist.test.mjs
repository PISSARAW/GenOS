import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseArguments, validateDistribution, verifyEvidence } from './run-specialist.mjs';

test('parseArguments accepts a bounded quick run', () => {
  const options = parseArguments(['--tasks', 'B04,B10', '--iterations', '3', '--events', '2', '--warmups', '1']);
  assert.deepEqual(options.tasks, ['B04', 'B10']);
  assert.equal(options.iterations, 3);
  assert.equal(options.events, 2);
  assert.equal(options.warmups, 1);
});

test('validateDistribution recomputes nearest-rank statistics', () => {
  const samples = [10, 20, 50, 80, 100];
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const variance = samples.reduce((sum, sample) => sum + ((sample - mean) ** 2), 0) / samples.length;
  assert.doesNotThrow(() => validateDistribution({
    count: 5,
    samples,
    min: 10,
    max: 100,
    p50: 50,
    p95: 100,
    p99: 100,
    mean,
    stddev: Math.sqrt(variance),
  }, 5, 'fixture'));
});

test('validateDistribution rejects a summary without raw observations', () => {
  assert.throws(() => validateDistribution({ count: 1 }, 1, 'fixture'), /missing raw samples/);
});

test('verifyEvidence fails closed when a locator becomes stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-benchmark-test-'));
  fs.writeFileSync(path.join(root, 'source.txt'), 'known evidence');
  const manifest = {
    system_id: 'fixture',
    dimensions: [{ id: 'capture', status: 'supported', evidence: [{ path: 'source.txt', contains: 'known evidence' }] }],
  };
  assert.equal(verifyEvidence(manifest, root)[0].evidence_status, 'verified');
  manifest.dimensions[0].evidence[0].contains = 'missing';
  assert.throws(() => verifyEvidence(manifest, root), /stale evidence/);
  fs.rmSync(root, { recursive: true, force: true });
});
