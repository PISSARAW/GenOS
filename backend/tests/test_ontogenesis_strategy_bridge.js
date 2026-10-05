'use strict';

const assert = require('assert');
const { buildStrategyContract } = require('../src/services/strategyContractService');
const { requestFor } = require('../src/services/ontogenesis/runtimeHarness');
const { missionRuntimeContext } = require('../bin/orchestratorMissionHelpers.cjs');

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
const runtimeContext = missionRuntimeContext({
  conceptResolution: { failClosed: true }, missionCapabilityPlan: { version: 1 },
  developmentalContext: { failClosed: true }, unrelated: 'not-forwarded'
});
assert.deepStrictEqual(runtimeContext.conceptResolution, { failClosed: true });
assert.strictEqual(runtimeContext.missionCapabilityPlan.version, 1);
assert.strictEqual(runtimeContext.unrelated, undefined);
console.log('ontogenesis strategy bridge checks passed.');
