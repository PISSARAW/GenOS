'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const topology = require('../src/services/topologyWorkerKindService');
const planner = require('../src/services/autonomousOrchestrationService/tokenPlanner');
const budgets = require('../src/services/workerEvidenceBarrierLocalBudget');
const trinity = require('../src/services/trinityService');

const members = topology.applyTopologyWorkerKinds('trinity',
  trinity.analyzeMission('Software engineering data analysis experiment').members, {});
const flags = {security: false, complex: false, uncertain: false};
const admitted = planner.buildTokenPlan({tokens: 160000, minimumWorkerTokens: 20000}, flags, members);
assert.equal(admitted.dispatchWorkers.length, 3);
assert.equal(admitted.admission.valid, true);
const refused = planner.buildTokenPlan({tokens: 600000, minimumWorkerTokens: 100000}, flags, members);
assert.equal(refused.dispatchWorkers.length, 0);
assert.equal(refused.admission.reason, 'worker_minimum_exceeds_runtime_ceiling');
assert.equal(refused.admission.runtimeCeilingFailures.length, 3);
const prompt = 'A public numerical induction prompt. '.repeat(100);
const effective = budgets.resolveMaxOutputTokens(20000, prompt, 32768);
assert.equal(effective, 20000 - budgets.estimatePromptTokens(prompt));
assert.ok(effective < 20000 && effective < 32768,
  'A requested generation ceiling never grants extra role or parent budget.');
console.log('Real Trinity roster admission respects role ceilings; oversized output remains bounded by its actual worker budget: PASS');
