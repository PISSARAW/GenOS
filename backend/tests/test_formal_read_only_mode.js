'use strict';

const assert = require('node:assert/strict');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');
const { buildWorkerSynthesisPrompt } = require('../src/services/agentEvidenceService');

const contract = buildStrategyContract({ problem: 'Prove a fixed Lean theorem.', evaluationMode: 'formal_read_only' });
assert.equal(contract.evaluation_mode, 'formal_read_only');
const plan = buildAutonomyPlan(contract, { tokens: 12000 });
assert.deepEqual(plan.phases.map((phase) => phase.key), ['formal_problem_baseline']);
assert.equal(plan.executionStatus, 'ready');

const dossier = { workerId: 'worker-proof', role: 'implementation', events: [
  { evidenceReport: { claims: [{ statement: 'A proof requires induction.', evidence: ['Lean goal'] }] } }
] };
const prompt = buildWorkerSynthesisPrompt('Return proofBody.', [dossier], { evaluationMode: 'formal_read_only' });
assert.ok(prompt.includes('dossierInfluence JSON shape'));
assert.ok(prompt.includes('Keep proofBody as valid Lean tactics without worker tags'));
assert.ok(!prompt.includes('Every factual sentence in the synthesis MUST carry source tags'));
console.log('Formal read-only mode checks passed.');
