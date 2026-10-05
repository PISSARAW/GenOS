'use strict';

const assert = require('assert');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { requestFor, conceptInstruction } = require('../src/services/ontogenesis/runtimeHarness');
const { missionRuntimeContext } = require('../bin/orchestratorMissionHelpers.cjs');
const { applyMissionCapabilityContract, conceptTools } = require('../src/services/missionCapabilityContractService');
const { orchestratorLeaseForPlan } = require('../src/services/toolLeasePolicy');
const { strategyForMission } = require('../src/services/ontogenesis/canonicalConceptRegistry');

const strategy = buildStrategyContract({
  problem: 'Create a React site with tests', requestedPrimary: 'minimal_patch'
});
assert.strictEqual(strategy.selected_strategy.primary, 'minimal_patch');
assert.ok(strategy.strategy_portfolio.some((entry) => entry.id === 'minimal_patch'));
assert.throws(() => buildStrategyContract({ problem: 'Create a React site', requestedPrimary: 'unknown_strategy' }),
  (error) => error.code === 'STRATEGY_REQUEST_UNKNOWN');

const request = requestFor({
  id: 'run-bridge', project: { id: 'p1', objective: 'Create a React site' },
  task: { id: 't1', title: 'implementer', acceptance_json: '[]' },
  selection: { topology: 'a_team', variant: 'default', workerRoles: [] },
  worktree: 'D:\\DynamicDuo', budgets: { seconds: 10, tokens: 1, usd: 0 }, config: {},
  mission: { capabilities: [], plan: { strategy: { id: 'minimal_patch' } } }
});
assert.strictEqual(request.strategyConcept.id, 'minimal_patch');
assert.match(request.mission, /Strategy concept:/);
assert.match(request.mission, /Canonical concepts:/);
assert.match(conceptInstruction({ canonicalConcepts: [{ id: 'mission' }], runtimeConcepts: [{ id: 'minimal_patch' }],
  strategy: { strategyId: 'minimal_patch' }, compatibleRuntimeConcepts: [{ id: 'a_team' }],
  runtimeLeaseCandidates: [{ tools: ['genos_snapshot'] }], blockedCapabilities: [] }), /minimal_patch/);
const runtimeContext = missionRuntimeContext({
  conceptResolution: { failClosed: true }, missionCapabilityPlan: { version: 1 },
  developmentalContext: { failClosed: true }, unrelated: 'not-forwarded'
});
assert.deepStrictEqual(runtimeContext.conceptResolution, { failClosed: true });
assert.strictEqual(runtimeContext.missionCapabilityPlan.version, 1);
assert.strictEqual(runtimeContext.unrelated, undefined);
const plan = applyMissionCapabilityContract({ organization: 'specialist_expert_committee', requiredTools: ['genos_snapshot'] }, {
  topologyContract: { mode: 'a_team', organization: 'specialist_expert_committee', required: ['SIGNALING_BUS'] },
  conceptLeaseCandidates: [{ tools: ['genos_worker_publish', 'genos_orchestrate'] }]
});
assert.deepStrictEqual(plan.capabilityContract.required, ['SIGNALING_BUS']);
assert.deepStrictEqual(conceptTools({ conceptLeaseCandidates: [{ tools: ['genos_worker_publish', 'genos_orchestrate'] }] }), ['genos_worker_publish']);
assert.deepStrictEqual(plan.requiredTools, ['genos_snapshot']);
assert.deepStrictEqual(plan.conceptTools, ['genos_worker_publish']);
const lease = orchestratorLeaseForPlan(plan);
assert.ok(lease.includes('genos_worker_publish'));
assert.ok(!lease.includes('genos_orchestrate'));
const decisionStrategy = strategyForMission('decide');
assert.strictEqual(decisionStrategy.id, 'pareto_frontier_concept');
assert.strictEqual(decisionStrategy.strategyId, 'pareto_frontier');
console.log('ontogenesis strategy bridge checks passed.');
