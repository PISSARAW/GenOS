'use strict';

const assert = require('assert');
const classifier = require('../src/services/holobionte/health/symbiontFailureClassifier');

const evidenceRefs = ['ledger:contribution-1'];

function classify(signals) {
  return classifier.classifySymbiontFailure({ symbiontId: 'symbiont-a', evidenceRefs, ...signals });
}

function testClassification() {
  const cases = [
    [{ integrityViolation: true }, 'COMPROMISED', 'QUARANTINE'],
    [{ pathobiotic: true }, 'PATHOBIOTIC', 'QUARANTINE'],
    [{ contractViolation: true }, 'CONTRACT_VIOLATING', 'REVOKE_TOOL'],
    [{ dependencyScore: 0.9 }, 'DEPENDENCY_RISK', 'REDUCE_RESOURCES'],
    [{ redundancyScore: 0.9 }, 'REDUNDANT', 'DORMANT'],
    [{ resourcePressure: 0.9 }, 'RESOURCE_HUNGRY', 'THROTTLE'],
    [{ falseAlertRate: 0.8 }, 'OVERCONFIDENT', 'WARN'],
    [{ staleScore: 0.9 }, 'STALE', 'WARN'],
    [{ contributionScore: 0.2 }, 'INCOMPETENT', 'WARN']
  ];
  for (const [signals, failureClass, action] of cases) {
    const result = classify(signals);
    assert.strictEqual(result.failureClass, failureClass);
    assert.strictEqual(result.recommendedActions[0], action);
    assert.deepStrictEqual(result.evidenceRefs, evidenceRefs);
  }
}

function testEvidenceAndPriority() {
  assert.throws(() => classifier.classifySymbiontFailure({}), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  const result = classify({ pathobiotic: true, contractViolation: true });
  assert.strictEqual(result.failureClass, 'PATHOBIOTIC');
  assert.strictEqual(classify({}).classified, false);
  assert.throws(() => classify({ staleScore: 1.1 }));
  assert.deepStrictEqual(classifier.responseForFailure('COMPROMISED'), ['QUARANTINE', 'DORMANT']);
}

testClassification();
testEvidenceAndPriority();
console.log('✅ Holobiont failure classifier tests passed.');
