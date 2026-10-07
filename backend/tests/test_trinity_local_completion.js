'use strict';
const assert = require('node:assert/strict');
const evidence = require('../src/services/localCompletionEvidence');
const observed = require('../src/services/trinityObservedDiversity');

const parsed = { factorialCell: { cellId: 'cell', factors: { approach: 'direct' } },
  counterfactual: { condition: 'baseline' }, oraclePrediction: { world_1: 1 },
  behaviorVector: [0.2, 0.8], temporalEffects: [], evidence: [{ id: 'unverified-observation' }],
  outcome: 'invented', author: 'invented', sealedDispatchParentId: 'invented' };
const report = evidence.attachFields({ outcome: 'success', author: 'runtime' }, parsed);
assert.equal(report.factorialCell, parsed.factorialCell);
assert.equal(report.behaviorVector, parsed.behaviorVector);
assert.equal(report.evidence[0].verificationReceipt, undefined);
assert.equal(report.outcome, 'success');
assert.equal(report.author, 'runtime');
assert.equal(report.sealedDispatchParentId, undefined);
assert.equal(evidence.observedRoute({ model: 'configured' }), null);
const route = evidence.observedRoute({ model: 'ollama://actual', provider: 'ollama' });
assert.deepEqual(route, { model: 'ollama://actual', provider: 'ollama' });
assert.equal(observed.provenance([{ eventType: 'AGENT_COMPLETED', eventId: 1, payload: route }]).source, 'runtime_completion_event');
console.log('Trinity local completion fields and observed route preservation: PASS');
