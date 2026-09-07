const assert = require('assert');
const { hypothesisEvidence, diagnose } = require('../src/services/primitiveHandlers/safetyHypothesis');

async function testPoint1() {
  console.log('--- Test Point 1: Falsification et Contre-exemples (safetyHypothesis) ---');

  // Test 1: Invariant hypothesis falsified by counterexample
  const invHyp = [{ id: 'hyp-inv-1', statement: 'Token validation invariant holds for all concurrent sessions', confidence: 0.9 }];
  const counterexampleEvidence = [
    {
      id: 'ev-1',
      counterexample: { token: 'expired-123', status: 200, error: 'Token accepted despite expiration' },
      detail: 'Failed: Token validation exception occurred. Assertion violation.'
    }
  ];

  const res1 = await hypothesisEvidence({ hypotheses: invHyp, evidence: counterexampleEvidence });
  assert.strictEqual(res1.falsifiedCount, 1, 'Invariant must be falsified by counterexample');
  assert.strictEqual(res1.retainedCount, 0, 'Invariant should not be retained');
  assert.strictEqual(res1.falsifiedHypotheses[0].confidence, 0.0);
  assert.ok(res1.falsifiedHypotheses[0].refutedBy.length > 0, 'Must record refutedBy');

  // Test 2: Invariant NOT falsified by passing evidence
  const passingEvidence = [
    { id: 'ev-2', detail: 'Token validation passed cleanly with 0 errors and healthy status' }
  ];
  const res2 = await hypothesisEvidence({ hypotheses: invHyp, evidence: passingEvidence });
  assert.strictEqual(res2.falsifiedCount, 0, 'Invariant must NOT be falsified by passing test');
  assert.strictEqual(res2.retainedCount, 1, 'Invariant must be retained when test passes');

  // Test 3: Bug hypothesis falsified by evidence confirming system is healthy
  const bugHyp = [{ id: 'hyp-bug-1', statement: 'Issue caused by cache corruption during database query', confidence: 0.8 }];
  const healthyEvidence = [
    { id: 'ev-3', detail: 'Cache query passed cleanly with 100% integrity and no error' }
  ];
  const res3 = await hypothesisEvidence({ hypotheses: bugHyp, evidence: healthyEvidence });
  assert.strictEqual(res3.falsifiedCount, 1, 'Bug hypothesis must be falsified if cache is healthy');
  assert.strictEqual(res3.retainedCount, 0);

  // Test 4: Explicit refutation targeting
  const explicitEvidence = [
    { id: 'ev-4', refutes: 'hyp-bug-1', detail: 'Formal proof of non-reproducibility' }
  ];
  const res4 = await hypothesisEvidence({ hypotheses: bugHyp, evidence: explicitEvidence });
  assert.strictEqual(res4.falsifiedCount, 1, 'Bug hypothesis must be falsified when explicitly refuted');

  console.log('  ✅ PASS: Point 1 falsification tests succeeded');
}

if (require.main === module) {
  testPoint1().catch(err => {
    console.error('Point 1 tests failed:', err);
    process.exit(1);
  });
}

module.exports = { testPoint1 };
