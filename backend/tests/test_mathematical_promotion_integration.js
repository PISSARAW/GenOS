'use strict';

const assert = require('node:assert/strict');
const { CONCEPT_DEFINITIONS } = require('../src/philosophy/conceptDefinitions');
const { normalizeConcept } = require('../src/philosophy/conceptRegistry');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { evaluatePromotionGate } = require('../src/services/strategyPromotionPolicyService');
const { buildMemoryRecord } = require('../src/services/agentMemoryStore');

const concept = normalizeConcept(CONCEPT_DEFINITIONS.find((item) => item.id === 'mathematics.platonism'));
const contract = buildStrategyContract({
  problem: 'Evaluate a mathematical ontology claim',
  philosophyContext: { concepts: [concept] }
});

assert.equal(contract.philosophical_context.interpretive, true);
assert.deepEqual(contract.philosophical_context.interpretiveConcepts, ['mathematics.platonism']);
assert.equal(contract.promotion.philosophy_hold, true);
assert.equal(contract.promotion.require_human_approval, true);

const blocked = evaluatePromotionGate(contract, {});
assert.equal(blocked.eligible, false);
assert.ok(blocked.violations.some((item) => item.policy === 'interpretive_philosophy_requires_verified_evidence'));

const record = buildMemoryRecord({
  agentId: 'worker-mathematics',
  task: 'Evaluate a mathematical ontology claim',
  summary: 'The conclusion remains interpretive.',
  options: { philosophy: contract.philosophy, claims: [] }
});
assert.equal(record.category, 'InterpretiveExperience');
assert.equal(record.philosophy.interpretationStatus, 'interpretive');
assert.match(record.content, /PHILOSOPHICAL_CONTEXT/);

console.log('Mathematical philosophy promotion integration: PASS');
