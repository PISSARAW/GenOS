'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const profiler = require('../src/services/requestProfilerService');
const router = require('../src/services/executionRouterService');
const { buildAutonomyPlan } = require('../src/services/autonomousOrchestrationService');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { KINDS } = require('../src/services/agents/workerKindService');
const rosterRequest = require('../src/services/workerRosterRequestService');
const { capAssignments } = require('../src/services/agentRuntimeAdapter/missionWorkers');
const nativeMethods = require('./helpers/nativeWorkerFixtures').fixtures(path.resolve(__dirname, '../..'));

const text = 'Crée dix rôles distincts pour traiter cette mission sociale.';
const parsed = rosterRequest.resolveWorkerRosterRequest({}, text);
assert.equal(parsed.requestedWorkers, 10);
assert.throws(() => rosterRequest.resolveWorkerRosterRequest({}, 'Crée dix rôles pour traiter 100 tâches.'),
  (error) => error.code === 'WORKER_TASK_SCHEDULING_UNSUPPORTED');
const profile = profiler.profileRequest({ mission: text }).profile;
assert.equal(profile.request_class, 'large_mission');
assert.equal(router.chooseExecutionPath(profile).mode, 'collective');

const contract = buildStrategyContract({
  problem: 'Plan independent workers for a controlled mission.',
  problemProfile: { type: 'general', complexity: 0.8, uncertainty: 0.2, risk: 'low' }
});
const request = { mission: text, worker_roster: { agent_count: 10 } };
const plan = buildAutonomyPlan(contract, { tokens: 500000, minimumWorkerTokens: 8000 }, request);
assert.equal(plan.workers.length, 10);
assert.equal(plan.dispatchWorkers.length, 10);
assert.equal(plan.workerRoster.requestedWorkers, 10);
assert.equal(plan.workerRoster.requestedTasks, null);
assert.equal(plan.workerRoster.exact, true);
assert.throws(() => capAssignments(plan.dispatchWorkers, {
  autonomyPlan: plan, normalizedMission: { executionPolicy: { workerFanoutLimit: 8 } }
}), (error) => error.code === 'WORKER_CARDINALITY_UNSATISFIABLE');

const blocked = buildAutonomyPlan(contract, { tokens: 12000, minimumWorkerTokens: 8000 }, request);
assert.equal(blocked.dispatchWorkers.length, 0);
assert.equal(blocked.executionStatus, 'blocked');
assert.equal(blocked.executionBlockers[0].code, 'WORKER_CARDINALITY_UNSATISFIABLE');

assert.throws(() => buildAutonomyPlan(contract, { tokens: 500000 }, {
  mission: 'Run every worker type for a roster qualification.',
  worker_roster: { agent_count: Object.keys(KINDS).length, types: { mode: 'all_registered' } }
}), { code: 'WORKER_TYPE_ASSIGNMENTS_REQUIRED' });

const completeAssignments = Object.fromEntries(Object.entries(nativeMethods).map(([kind, methodContract]) => [kind, {
  workerKind: kind, methodContract,
  ...(kind === 'symbiotic_worker' ? { hostContractId: 'host-native',
    hostCapabilities: ['deterministic_procedure'] } : {}),
  ...(kind === 'recovery_worker' ? { recoveryLease: { action: 'restore_checkpoint', path: 'state.txt' } } : {}),
  ...(kind === 'sub_orchestrator' ? { delegatedTokenLimit: 1000 } : {})
}]));
const allKinds = buildAutonomyPlan(contract, { tokens: 500000 }, {
  mission: 'Run every worker type with complete structured contracts.',
  workerAssignments: completeAssignments,
  worker_roster: { agent_count: Object.keys(KINDS).length, types: { mode: 'all_registered' } }
});
assert.equal(new Set(allKinds.dispatchWorkers.map((worker) => worker.workerKind)).size, Object.keys(KINDS).length);
assert.ok(allKinds.dispatchWorkers.every((worker) => worker.methodContract?.version === 1));
assert.throws(() => rosterRequest.resolveWorkerRosterRequest({ worker_roster: {
  agent_count: 10, types: { mode: 'all_registered' }
} }, ''), (error) => error.code === 'WORKER_TYPE_CARDINALITY_CONFLICT');
assert.throws(() => rosterRequest.resolveWorkerRosterRequest({ worker_roster: {
  types: { mode: 'explicit' }
} }, ''), (error) => error.code === 'WORKER_TYPE_POLICY_INVALID');
assert.throws(() => rosterRequest.resolveWorkerRosterRequest({ worker_roster: {
  types: { mode: 'mix' }
} }, ''), (error) => error.code === 'WORKER_TYPE_POLICY_INVALID');

assert.throws(() => buildAutonomyPlan(contract, { tokens: 120000 }, {
  mission: 'Prove the result.',
  worker_roster: { agent_count: 4, types: { mode: 'allowlist', kinds: ['math_worker'] } }
}), { code: 'WORKER_NATIVE_METHOD_REQUIRED' });
const explicit = buildAutonomyPlan(contract, { tokens: 120000 }, {
  mission: 'Compute the structured integral.',
  workerAssignments: { math: { workerKind: 'math_worker', methodContract: nativeMethods.math_worker } },
  worker_roster: { agent_count: 1, types: { mode: 'allowlist', kinds: ['math_worker'] } }
});
assert.deepEqual([...new Set(explicit.workers.map((worker) => worker.workerKind))], ['math_worker']);
assert.equal(explicit.workers[0].methodContract.methodId, 'compute_integral');
assert.throws(() => buildAutonomyPlan(contract, { tokens: 500000 }, {
  mission: 'Check quota validation.',
  worker_roster: { agent_count: 4, types: { mode: 'mix', quotas: { verifier_worker: 2 } } }
}), (error) => error.code === 'WORKER_TYPE_QUOTA_CARDINALITY_MISMATCH');

const { defaultAutoKinds } = require('../src/services/workerRosterPlanner');
assert.equal(defaultAutoKinds('Surveille ce territoire et alerte')[0], 'resident_daemon');
assert.equal(defaultAutoKinds('Prépare une passation entre équipes')[0], 'liaison_worker');
assert.equal(defaultAutoKinds('Analyse la cause racine de cet incident')[0], 'forensic_worker');
assert.equal(defaultAutoKinds('Étudie ce cas éducatif synthétique')[0], 'medical_worker');
assert.equal(defaultAutoKinds('Délègue ce sous-graphe')[0], 'sub_orchestrator');
assert.equal(defaultAutoKinds('Utilise un architecte backend expert')[0], 'specialist');

const defaultPlan = buildAutonomyPlan(contract, { tokens: 500000 }, { mission: 'Implement the scoped change.' });
assert.ok(defaultPlan.dispatchWorkers.every((worker) => worker.workerKind && worker.methodContract?.methodId === 'prompt_defined'));

console.log('Worker roster cardinality and type policy checks passed.');
