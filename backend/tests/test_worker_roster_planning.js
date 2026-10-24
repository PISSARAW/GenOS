'use strict';

const assert = require('node:assert/strict');
const profiler = require('../src/services/requestProfilerService');
const router = require('../src/services/executionRouterService');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { KINDS } = require('../src/services/agents/workerKindService');
const rosterRequest = require('../src/services/workerRosterRequestService');
const { capAssignments } = require('../src/services/agentRuntimeAdapter/missionWorkers');

const text = 'Crée dix rôles distincts pour traiter 100 tâches sociales.';
const parsed = rosterRequest.resolveWorkerRosterRequest({}, text);
assert.equal(parsed.requestedWorkers, 10);
assert.equal(parsed.requestedTasks, 100);
const profile = profiler.profileRequest({ mission: text }).profile;
assert.equal(profile.request_class, 'large_mission');
assert.equal(router.chooseExecutionPath(profile).mode, 'collective');

const contract = buildStrategyContract({
  problem: 'Plan independent workers for a controlled mission.',
  problemProfile: { type: 'general', complexity: 0.8, uncertainty: 0.2, risk: 'low' }
});
const request = { mission: text, worker_roster: { agent_count: 10, task_count: 100 } };
const plan = buildAutonomyPlan(contract, { tokens: 500000, minimumWorkerTokens: 8000 }, request);
assert.equal(plan.workers.length, 10);
assert.equal(plan.dispatchWorkers.length, 10);
assert.equal(plan.workerRoster.requestedWorkers, 10);
assert.equal(plan.workerRoster.requestedTasks, 100);
assert.equal(plan.workerRoster.exact, true);
assert.throws(() => capAssignments(plan.dispatchWorkers, {
  autonomyPlan: plan, normalizedMission: { executionPolicy: { workerFanoutLimit: 8 } }
}), (error) => error.code === 'WORKER_CARDINALITY_UNSATISFIABLE');

const blocked = buildAutonomyPlan(contract, { tokens: 12000, minimumWorkerTokens: 8000 }, request);
assert.equal(blocked.dispatchWorkers.length, 0);
assert.equal(blocked.executionStatus, 'blocked');
assert.equal(blocked.executionBlockers[0].code, 'WORKER_CARDINALITY_UNSATISFIABLE');

const allKinds = buildAutonomyPlan(contract, { tokens: 500000 }, {
  mission: 'Run every worker type for a roster qualification.',
  worker_roster: { agent_count: Object.keys(KINDS).length, types: { mode: 'all_registered' } }
});
assert.equal(new Set(allKinds.dispatchWorkers.map((worker) => worker.workerKind)).size, Object.keys(KINDS).length);
assert.throws(() => rosterRequest.resolveWorkerRosterRequest({ worker_roster: {
  agent_count: 10, types: { mode: 'all_registered' }
} }, ''), (error) => error.code === 'WORKER_TYPE_CARDINALITY_CONFLICT');
assert.throws(() => rosterRequest.resolveWorkerRosterRequest({ worker_roster: {
  types: { mode: 'explicit' }
} }, ''), (error) => error.code === 'WORKER_TYPE_POLICY_INVALID');
assert.throws(() => rosterRequest.resolveWorkerRosterRequest({ worker_roster: {
  types: { mode: 'mix' }
} }, ''), (error) => error.code === 'WORKER_TYPE_POLICY_INVALID');

const explicit = buildAutonomyPlan(contract, { tokens: 120000 }, {
  mission: 'Prove the result.',
  worker_roster: { agent_count: 4, types: { mode: 'allowlist', kinds: ['math_worker'] } }
});
assert.deepEqual([...new Set(explicit.workers.map((worker) => worker.workerKind))], ['math_worker']);
assert.throws(() => buildAutonomyPlan(contract, { tokens: 500000 }, {
  mission: 'Check quota validation.',
  worker_roster: { agent_count: 4, types: { mode: 'mix', quotas: { verifier_worker: 2 } } }
}), (error) => error.code === 'WORKER_TYPE_QUOTA_CARDINALITY_MISMATCH');

console.log('Worker roster cardinality and type policy checks passed.');
