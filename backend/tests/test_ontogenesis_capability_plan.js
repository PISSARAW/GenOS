'use strict';

const assert = require('assert');
const { buildMissionCapabilityPlan } = require('../src/services/ontogenesis/missionCapabilityPlanService');

const plan = buildMissionCapabilityPlan({
  project: { id: 'p1' }, task: { id: 't1', acceptance_json: '["build"]' },
  selection: { topology: 'a_team', variant: 'default' },
  config: { budgets: { tokens: 100 }, authority: { paths: ['*'] } },
  mission: {
    capabilities: ['execute', 'verify'], domains: ['orchestration'], capabilityCatalog: [],
    concepts: { domains: ['orchestration'], operational: [{ capability: 'MCP' }], unavailable: [{ capability: 'consciousness' }] },
    profile: {}, morphology: { selectedTopology: 'a_team' }
  }
});

assert.deepStrictEqual(plan.capabilityRequirements, ['execute', 'verify', 'MCP']);
assert.strictEqual(plan.blockedCapabilities[0].capability, 'consciousness');
assert.strictEqual(plan.topology, 'a_team');
assert.strictEqual(plan.organization, null);
assert.strictEqual(plan.topologyContract.mode, 'a_team');
assert.ok(plan.topologyContract.required.includes('SIGNALING_BUS'));
assert.deepStrictEqual(plan.requestedConcepts, ['orchestration']);
assert.deepStrictEqual(plan.canonicalConcepts, []);
assert.deepStrictEqual(plan.runtimeConcepts, []);
assert.deepStrictEqual(plan.compatibleRuntimeConcepts, []);
assert.deepStrictEqual(plan.runtimeLeaseCandidates, []);
assert.deepStrictEqual(plan.resolvedConcepts, []);
assert.deepStrictEqual(plan.blockedConcepts, []);
assert.deepStrictEqual(plan.philosophicalContracts, { required: false, promotionEligible: false, contracts: [] });
assert.deepStrictEqual(plan.runtimeBridges.map((bridge) => bridge.id), ['a-team-variant-runtime']);
assert.strictEqual(plan.strategy, null);

const integratedPlan = buildMissionCapabilityPlan({
  project: { id: 'p2' }, task: { id: 't2', acceptance_json: '[]' },
  selection: { topology: 'biome', variant: 'web_sensorium' }, config: {},
  mission: {
    capabilities: ['WEB_FORAGING', 'FOVEAL_PERCEPTION', 'COMPUTER_USE', 'PROVENANCE'],
    concepts: { resolvedConcepts: [{ id: 'global_workspace' }], operational: [] }, morphology: {}
  }
});
assert.deepStrictEqual(integratedPlan.runtimeBridges.map((bridge) => bridge.id), [
  'concept-runtime', 'web-sensorium', 'biome-vertical-slice', 'rust-node-contract'
]);
console.log('ontogenesis capability plan checks passed.');
