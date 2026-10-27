'use strict';

const assert = require('node:assert/strict');
const policy = require('../src/services/workerTokenBudgetPolicy');
const { buildAllocation } = require('../src/services/tokenAllocationService');
const teamBudget = require('../src/services/aTeamDispatchBudgetService');
const { buildTokenPlan } = require('../src/services/autonomousOrchestrationService/tokenPlanner');

const workers = Array.from({ length: 4 }, () => ({ role: 'implementation' }));
const profiles = policy.profileWorkers(workers);
assert.deepEqual(profiles.map(profile => profile.minimumStartTokens), [8000, 8000, 8000, 8000]);
assert.deepEqual(profiles.map(profile => profile.targetTokens), [12000, 12000, 12000, 12000]);
assert.deepEqual(profiles.map(profile => profile.maximumTokens), [20000, 20000, 20000, 20000]);

const repairPass = buildTokenPlan({ tokens: 80000, minimumWorkerTokens: 12000 },
  { complex: true }, Array.from({ length: 3 }, () => ({ role: 'implementation' })));
assert.deepEqual(repairPass.rounds.initial.workerTokens, [12000, 12000, 12000],
  'the explicit local-code minimum must reach each worker allocation');

const elastic = policy.budgetEnvelope(64000, profiles);
assert.equal(elastic.orchestratorReserveTokens, 11200);
assert.equal(elastic.workerPool, 52800);
assert.equal(elastic.minimumOrchestratorReserveTokens, 8000);
assert.equal(policy.minimumAcceptableTotal(profiles), 42105);

const explicit = policy.budgetEnvelope(64000, profiles, { workerShare: 0.8 });
assert.equal(explicit.orchestratorReserveTokens, 12800);
assert.equal(explicit.workerPool, 51200);
assert.equal(explicit.valid, true);

const teamPolicy = { total: 64000, workerShare: 0.8, orchestratorReserve: 0.2,
  explicitWorkerShare: true, minimumWorkerTokens: 8000,
  minimumWorkerTokensExplicit: true, allocation: 'successive_halving_with_reallocation' };
teamBudget.applyWorkerBudget(teamPolicy, workers);
assert.equal(teamPolicy.admission.valid, true);
assert.equal(teamPolicy.admission.fundedWorkers, 4);
assert.deepEqual(teamPolicy.rounds.continuation.workerTokens, [9600, 9600]);

const staged = buildAllocation({ totalTokens: 64000, workerShare: 0.8,
  workerCount: 4, workerBudgets: profiles, mode: 'successive_halving_with_reallocation' });
assert.deepEqual(staged.initial.workerTokens, [8000, 8000, 8000, 8000]);
assert.deepEqual(staged.continuation.workerTokens, [9600, 9600]);
assert.equal(staged.recoveryPool, 0);

const insufficient = policy.budgetEnvelope(32000, profiles, { workerShare: 0.6 });
assert.equal(insufficient.workerPool, 19200);
assert(insufficient.workerPool < policy.sumField(profiles, 'minimumStartTokens'));

const exact = policy.budgetEnvelope(40000, profiles, { workerShare: 0.8 });
assert.equal(exact.workerPool, 32000);
assert.equal(exact.orchestratorReserveTokens, 8000);
assert.equal(exact.valid, true);

const nativeProfiles = policy.profileWorkers([
  { workerKind: 'procedural_executor', role: 'procedural_executor' },
  { workerKind: 'formal_worker', role: 'formal_worker' }
]);
assert.deepEqual(nativeProfiles.map(profile => profile.maximumTokens), [0, 0]);

const morphogenesisProfiles = policy.profileWorkers([
  { workerKind: 'scout_cell', role: 'environment_mapper', methodContract: { methodId: 'scan_literal' } },
  { workerKind: 'specialist', role: 'resource_steward', methodContract: { methodId: 'prompt_defined' } }
], 1500);
assert.deepEqual(morphogenesisProfiles.map(profile => profile.minimumStartTokens), [1500, 3000],
  'resource steward retains enough initial tokens for the measured Qwen prompt while honoring the configured minimum floor');

const overContract = policy.profileWorkers([
  { workerKind: 'scout_cell', role: 'environment_mapper', methodContract: { methodId: 'prompt_defined' } },
  { workerKind: 'specialist', role: 'resource_steward', methodContract: { methodId: 'prompt_defined' } }
], 30000);
assert.deepEqual(overContract.map(profile => profile.runtimeMaximumTokens), [8000, 20000]);
assert.deepEqual(overContract.map(profile => profile.runtimeCeilingExceeded), [true, true]);
const rejectedPlan = buildTokenPlan({ tokens: 200000, workerShare: 0.8, minimumWorkerTokens: 30000 },
  { security: true }, [
    { workerKind: 'scout_cell', role: 'environment_mapper', methodContract: { methodId: 'prompt_defined' } },
    { workerKind: 'specialist', role: 'resource_steward', methodContract: { methodId: 'prompt_defined' } }
  ]);
assert.equal(rejectedPlan.dispatchWorkers.length, 0,
  'workers must not be dispatched when their requested floor exceeds the canonical runtime contract');
assert.equal(rejectedPlan.admission.valid, false);
assert.equal(rejectedPlan.admission.reason, 'worker_minimum_exceeds_runtime_ceiling');
assert.deepEqual(rejectedPlan.admission.runtimeCeilingFailures.map(failure => failure.runtimeMaximumTokens), [8000, 20000]);
const rejectedTeamPolicy = { total: 200000, workerShare: 0.8, minimumWorkerTokens: 30000,
  minimumWorkerTokensExplicit: true, explicitWorkerShare: true };
assert.equal(teamBudget.affordableWorkerCount(rejectedTeamPolicy, 0.8, [
  { workerKind: 'scout_cell', role: 'environment_mapper', methodContract: { methodId: 'prompt_defined' } },
  { workerKind: 'specialist', role: 'resource_steward', methodContract: { methodId: 'prompt_defined' } }
]), 0, 'A-Team admission must also respect canonical worker runtime ceilings');
teamBudget.applyWorkerBudget(rejectedTeamPolicy, [
  { workerKind: 'scout_cell', role: 'environment_mapper', methodContract: { methodId: 'prompt_defined' } },
  { workerKind: 'specialist', role: 'resource_steward', methodContract: { methodId: 'prompt_defined' } }
]);
assert.equal(rejectedTeamPolicy.admission.reason, 'worker_minimum_exceeds_runtime_ceiling');

const communicating = policy.profileWorkers([
  { workerKind: 'scout_cell', role: 'environment_mapper', communicationRequired: true,
    methodContract: { methodId: 'prompt_defined' } }
], 30000);
assert.deepEqual(communicating.map(profile => profile.runtimeMaximumTokens), [40000]);
assert.equal(communicating[0].runtimeCeilingExceeded, false,
  'a contract that explicitly grants a larger communication budget can fund the requested worker minimum');

const unsafeOverride = policy.budgetEnvelope(64000, profiles, { workerShare: 0.95 });
assert.equal(unsafeOverride.valid, false);
assert.equal(unsafeOverride.invalidReason, 'orchestrator_reserve_below_minimum');

console.log('Role-aware token budgets, elastic reserve, and atomic admission checks passed.');
