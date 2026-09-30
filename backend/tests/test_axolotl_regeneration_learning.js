'use strict';

const assert = require('node:assert/strict');
const learning = require('../src/services/axolotlRegenerationLearning');
const service = require('../src/services/axolotlRegenerationService');
const handlers = require('../src/services/primitiveHandlers/axolotlStrategyHandlers');

async function main() {
  const record = learning.createLearningRecord({ candidates: [{ id: 'candidate-a', content: { rule: 'x', description: 'Validated routing rule.' } }] });
  assert.equal(record.candidates[0].status, 'proposed');
  const pending = await learning.evaluateCandidates(record);
  assert.equal(pending.status, 'awaiting_evaluator');
  const evaluated = await learning.evaluateCandidates(record, async () => ({ passed: true, evidenceRefs: ['receipt-1'] }));
  assert.equal(evaluated.candidates[0].status, 'supported_candidate');
  assert.deepEqual(evaluated.candidates[0].evidence, ['receipt-1']);
  const rejected = await learning.evaluateCandidates(record, async () => ({ passed: true, evidenceRefs: [] }));
  assert.equal(rejected.candidates[0].status, 'rejected_candidate');
  const writes = [];
  const promotion = await learning.promoteCandidate({
    candidate: evaluated.candidates[0], sessionId: 'regen-test', sourceAgentId: 'agent-test',
    db: { run: async (...args) => writes.push(args) },
    evidenceVerifier: async ({ evidenceRefs }) => ({ valid: true, verifiedRefs: evidenceRefs, receiptId: 'verified-1' })
  });
  assert.equal(promotion.success, true);
  assert.equal(promotion.promotionLevel, 0);
  assert.equal(writes.length, 1);
  const unverified = await learning.promoteCandidate({ candidate: evaluated.candidates[0], sessionId: 'regen-test', db: { run: async () => {} } });
  assert.equal(unverified.code, 'COGNITIVE_EVIDENCE_VERIFIER_REQUIRED');
  const plan = await handlers.plan_regeneration({ mission: 'route requests', currentTopology: { structure: 'centralized' } });
  await service.prepareCognitiveLearning(plan.sessionId, { candidates: [{ id: 'route-rule', content: 'Prefer the validated route.' }] });
  await handlers.execute_regeneration({ sessionId: plan.sessionId, evaluateCognitiveCandidate: async () => ({ passed: true, evidenceRefs: ['runtime-proof'] }) });
  assert.equal(service.getRegenerationSession(plan.sessionId).learning.status, 'evaluated');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
