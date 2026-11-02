'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../../benchmarks/agow-paired-native/contract.cjs');
const { summarize } = require('../../benchmarks/agow-paired-native/analysis.cjs');

function fixture() {
  const cases = contract.cases().map((item) => ({ ...item, methodHash: contract.digest(contract.method(item)),
    initialDatabaseHash: 'a'.repeat(64), inputFileHash: 'b'.repeat(64) }));
  const manifest = { schema: contract.SCHEMA, cases, conditions: contract.CONDITIONS,
    limits: contract.LIMITS, schedule: contract.schedule(cases), createdAt: 1, holdout: false, promotionAllowed: false };
  const arms = manifest.schedule.map((slot, index) => ({ ...slot, runId: `run-${index}`,
    manifestHash: contract.digest(manifest), initialDatabaseHash: 'a'.repeat(64), inputFileHash: 'b'.repeat(64),
    methodHash: cases.find((item) => item.caseId === slot.caseId).methodHash,
    limits: structuredClone(contract.LIMITS), startedAt: 2, controlAuthority: slot.condition === 'bounded' ? 'agow' : 'historical',
    loss: slot.caseId === 'witness' ? 0 : null, nativeRevalidated: slot.caseId === 'witness',
    observationStatus: slot.caseId === 'witness' ? 'verified' : 'verification_pending', evidenceRefs: ['synthetic-test-only'],
    costs: { complete: true, processes: 2, runtimeMs: 25 + index } }));
  return { manifest, arms };
}

test('paired arithmetic retains unknowns and labels the limited interpretation', () => {
  const { manifest, arms } = fixture();
  const result = summarize(manifest, arms);
  assert.equal(result.conditions.shadow.coverage, 0.5);
  assert.deepEqual(result.conditions.bounded.allTaskLossBounds, [0, 0.5]);
  assert.equal(result.pairedCoverage, 0.5);
  assert.equal(result.meanKnownPairedDelta, 0);
  assert.deepEqual(result.allPairDeltaBounds, [-0.5, 0.5]);
  assert.equal(result.boundsKind, 'arithmetic_not_confidence_interval');
  assert.equal(result.promotionAllowed, false);
});

test('paired loss deltas retain their direction when one arm is refuted', () => {
  for (const condition of contract.CONDITIONS) {
    const { manifest, arms } = fixture();
    arms.find((arm) => arm.caseId === 'witness' && arm.condition === condition).loss = 1;
    const result = summarize(manifest, arms);
    assert.equal(result.meanKnownPairedDelta, condition === 'bounded' ? 1 : -1);
    assert.deepEqual(result.allPairDeltaBounds, condition === 'bounded' ? [0, 1] : [-1, 0]);
  }
});

const corruptions = {
  'different initial database': (x) => { x.arms[0].initialDatabaseHash = 'c'.repeat(64); },
  'different input file': (x) => { x.arms[0].inputFileHash = 'c'.repeat(64); },
  'different task': (x) => { x.arms[0].methodHash = 'forged'; },
  'different limits': (x) => { x.arms[0].limits.tokens = 1; },
  'manifest registered after execution': (x) => { x.arms[0].startedAt = 0; },
  'wrong actual control authority': (x) => { x.arms[0].controlAuthority = 'agow'; },
  'numeric loss without native recheck': (x) => { x.arms[0].nativeRevalidated = false; },
  'numeric loss without observation proof': (x) => { x.arms[0].evidenceRefs = []; },
  'missing slot': (x) => { x.arms.pop(); },
  'duplicated slot': (x) => { x.arms.push(structuredClone(x.arms[0])); },
  'reused native run': (x) => { x.arms[1].runId = x.arms[0].runId; },
  'changed manifest': (x) => { x.arms[0].manifestHash = 'forged'; },
  'unknown converted to numeric loss': (x) => { x.arms[2].loss = 0; }
};

for (const [name, corrupt] of Object.entries(corruptions)) {
  test(`paired campaign refuses ${name}`, () => {
    const input = fixture();
    corrupt(input);
    assert.throws(() => summarize(input.manifest, input.arms));
  });
}

test('all unknown losses and costs remain unknown', () => {
  const { manifest, arms } = fixture();
  for (const arm of arms) Object.assign(arm, { loss: null, nativeRevalidated: false, costs: null });
  const result = summarize(manifest, arms);
  assert.equal(result.meanKnownPairedDelta, null);
  assert.equal(result.conditions.shadow.meanKnownLoss, null);
  assert.equal(result.conditions.bounded.costs.knownOracleProcesses, null);
  assert.deepEqual(result.allPairDeltaBounds, [-1, 1]);
});

test('archive refuses a nonempty SQLite WAL instead of reading an older main database', async () => {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const directory = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'genos-paired-wal-'));
  const database = path.join(directory, 'mission.sqlite');
  try {
    await fs.writeFile(database, 'synthetic file: no SQLite query should be attempted');
    await fs.writeFile(database + '-wal', 'uncheckpointed state');
    await assert.rejects(require('../../benchmarks/agow-paired-native/archive.cjs')
      .checkpointed(directory, database), /checkpointed and closed/);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(require('node:os').tmpdir()));
    assert.ok(path.basename(directory).startsWith('genos-paired-wal-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
