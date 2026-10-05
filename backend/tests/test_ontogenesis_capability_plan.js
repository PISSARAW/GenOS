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
assert.deepStrictEqual(plan.requestedConcepts, ['orchestration']);
assert.deepStrictEqual(plan.canonicalConcepts, []);
console.log('ontogenesis capability plan checks passed.');
