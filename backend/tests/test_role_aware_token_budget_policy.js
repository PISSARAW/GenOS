'use strict';

const assert = require('node:assert/strict');
const policy = require('../src/services/workerTokenBudgetPolicy');
const { buildAllocation } = require('../src/services/tokenAllocationService');
const teamBudget = require('../src/services/aTeamDispatchBudgetService');

const workers = Array.from({ length: 4 }, () => ({ role: 'implementation' }));
const profiles = policy.profileWorkers(workers);
assert.deepEqual(profiles.map(profile => profile.minimumStartTokens), [8000, 8000, 8000, 8000]);
assert.deepEqual(profiles.map(profile => profile.targetTokens), [12000, 12000, 12000, 12000]);
assert.deepEqual(profiles.map(profile => profile.maximumTokens), [20000, 20000, 20000, 20000]);

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

const unsafeOverride = policy.budgetEnvelope(64000, profiles, { workerShare: 0.95 });
assert.equal(unsafeOverride.valid, false);
assert.equal(unsafeOverride.invalidReason, 'orchestrator_reserve_below_minimum');

console.log('Role-aware token budgets, elastic reserve, and atomic admission checks passed.');
