/**
 * Tests du Semantic Loop Detector.
 *
 * Vérifie que la détection se base sur l'information (Δ)
 * et non sur la topologie du graphe.
 */

const assert = require('assert');
const { detectSemanticCycle, computeDeltaInformation, extractSemanticSnapshot } = require('../src/services/primitiveHandlers/detection/cycleDetection');

function testExtractSemanticSnapshot() {
  const msg = {
    from: 'agent-a',
    payload: {
      claims: ['auth is safe', 'tests pass'],
      evidence: ['test output', 'hash:abc'],
      uncertainty: 0.3,
    },
  };
  const snap = extractSemanticSnapshot(msg);
  assert.strictEqual(snap.claims.length, 2);
  assert.strictEqual(snap.evidence.length, 2);
  assert.strictEqual(snap.uncertainty, 0.3);
  assert.strictEqual(snap.claimCount, 2);
}

function testComputeDeltaInformation() {
  const prev = {
    claims: ['auth is safe'],
    artefacts: [],
    evidence: ['test1'],
    uncertainty: 0.8,
    claimCount: 1,
    artefactCount: 0,
    evidenceCount: 1,
  };
  const curr = {
    claims: ['auth is safe', 'XSS blocked'],
    artefacts: [],
    evidence: ['test1', 'test2'],
    uncertainty: 0.2,
    claimCount: 2,
    artefactCount: 0,
    evidenceCount: 2,
  };
  const delta = computeDeltaInformation(prev, curr);
  assert.strictEqual(delta.claimDelta, 1);
  assert.strictEqual(delta.evidenceDelta, 1);
  assert.ok(Math.abs(delta.uncertaintyReduction - 0.6) < 0.001);
  assert.strictEqual(delta.isNovel, true);
  assert.strictEqual(delta.isProgress, true);
}

function testNoCycleWithProgress() {
  // Sequence with constant information gain — NOT a cycle
  const sequence = [];
  for (let i = 0; i < 10; i++) {
    sequence.push({
      from: 'agent-a',
      action: `action-${i}`,
      payload: {
        claims: [`claim-${i}`],
        evidence: [`evidence-${i}`],
        uncertainty: 1.0 - i * 0.1,
      },
    });
  }
  const result = detectSemanticCycle(sequence, { windowSize: 3, minStagnantRounds: 2 });
  assert.strictEqual(result.hasCycle, false, 'Progressing sequence should not be a cycle');
}

function testCycleWithStagnation() {
  // Sequence cycling without information gain — IS a cycle
  const sequence = [];
  for (let i = 0; i < 10; i++) {
    sequence.push({
      from: 'agent-a',
      action: 'retry',
      payload: {
        claims: ['same-claim'],
        evidence: [],
        uncertainty: 0.5,
      },
    });
  }
  const result = detectSemanticCycle(sequence, { windowSize: 3, minStagnantRounds: 3 });
  assert.strictEqual(result.hasCycle, true, 'Stagnant sequence should be a cycle');
  assert.strictEqual(result.loopType, 'semantic_stagnation');
}

function testProductiveLoopNotDetected() {
  // A→B (hypothesis) → A→B (counterexample) → A→B (corrected hypothesis)
  // This is productive and should NOT be flagged
  const sequence = [];
  for (let i = 0; i < 8; i++) {
    sequence.push({
      from: i % 2 === 0 ? 'A' : 'B',
      action: i % 2 === 0 ? 'hypothesis' : 'challenge',
      payload: {
        claims: [`claim-${i}`, `evidence-${i}`],
        evidence: Array.from({ length: i + 1 }, (_, j) => `evidence-${j}`),
        uncertainty: Math.max(0.05, 1.0 - i * 0.15),
      },
    });
  }
  const result = detectSemanticCycle(sequence, { windowSize: 3, minStagnantRounds: 2 });
  assert.strictEqual(result.hasCycle, false, 'Productive dialogue should not be flagged as cycle');
}

function testInsufficientHistory() {
  const sequence = [
    { from: 'A', action: 'a1', payload: { claims: ['x'], evidence: [], uncertainty: 0.5 } },
    { from: 'B', action: 'b1', payload: { claims: ['x'], evidence: [], uncertainty: 0.5 } },
  ];
  const result = detectSemanticCycle(sequence, { windowSize: 6, minStagnantRounds: 3 });
  assert.strictEqual(result.hasCycle, false);
  assert.strictEqual(result.reason, 'INSUFFICIENT_HISTORY');
}

async function run() {
  testExtractSemanticSnapshot();
  console.log('[PASS] extractSemanticSnapshot normalizes claims/evidence/uncertainty');

  testComputeDeltaInformation();
  console.log('[PASS] computeDeltaInformation detects gain');

  testNoCycleWithProgress();
  console.log('[PASS] progressing sequence not flagged as cycle');

  testCycleWithStagnation();
  console.log('[PASS] stagnant sequence flagged as semantic_stagnation');

  testProductiveLoopNotDetected();
  console.log('[PASS] productive hypothesis→counterexample→proof loop not flagged');

  testInsufficientHistory();
  console.log('[PASS] insufficient history returns false');

  console.log('\nTous les tests du Semantic Loop Detector sont passés.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
