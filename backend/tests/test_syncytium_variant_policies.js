'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const registry = require('../src/services/syncytium/variants/variantPolicyRegistry');

async function main() {
  const ids = syncytium.listVariantPolicies().map((policy) => policy.id);
  assert.equal(ids.length, 13);
  const methods = [
    'analyzeFit', 'configureSchema', 'configureConsistencyZones', 'configureDomains',
    'configureInvariants', 'configureReplication', 'configureRepair', 'configureStopConditions'
  ];
  for (const id of ids) {
    const policy = registry.getPolicy(id);
    for (const method of methods) assert.equal(typeof policy[method], 'function', `${id} has ${method}`);
    assert.equal(typeof policy.analyzeFit('work', { variantId: id }).score, 'number');
    assert.ok(policy.configureSchema({}).fields);
    assert.ok(Array.isArray(policy.configureRepair()));
    assert.ok(Array.isArray(policy.configureStopConditions()));
  }

  assert.equal(registry.selectPolicy('code graph dependency refactor').id, 'code');
  assert.equal(registry.selectPolicy('dependency graph with edges').id, 'graph');
  assert.equal(registry.selectPolicy('Human approval required for this agent action.').id, 'humanAi');
  assert.deepEqual(registry.POLICY_PRIORITY, ['humanAi', 'code', 'graph', 'transactional', 'speculative', 'hierarchical']);
  assert.throws(() => registry.getPolicy('missing'), (error) => error.code === 'SYNCYTIUM_VARIANT_POLICY_UNKNOWN');

  const session = await syncytium.createPolicySession('Refactor shared code with tests.', { variantId: 'code' });
  assert.equal(session.variantPolicy.id, 'code');
  assert.equal(session.variantPolicy.consistencyZones.files, 'INVARIANT_PRESERVING');
  const graphPolicy = registry.getPolicy('graph');
  assert.deepEqual(Object.keys(graphPolicy.configureSchema({}).fields), ['graph_nodes', 'graph_edges']);
  const humanPolicy = registry.getPolicy('humanAi');
  const humanFields = humanPolicy.configureSchema({}).fields;
  assert.equal(humanFields['human.approvals'].ownerDomain, 'human-authority');
  assert.equal(humanFields['human.comments'].consistencyZone, 'APPEND_ONLY');
  const humanNuclei = [
    { nucleusId: 'human', principalId: 'person', kind: 'human' },
    { nucleusId: 'agent', principalId: 'worker', kind: 'llm_worker' }
  ];
  const humanSession = await syncytium.createPolicySession('Human and agent collaborate.', {
    variantId: 'humanAi', configuration: { nuclei: humanNuclei }
  });
  assert.equal(humanSession.variantPolicy.id, 'humanAi');
  assert.deepEqual(humanSession.domains['human-authority'].members, ['person']);
  await assert.rejects(() => syncytium.createPolicySession('Human and agent collaborate.', {
    variantId: 'humanAi', configuration: { nuclei: [humanNuclei[1]] }
  }), (error) => error.code === 'SYNCYTIUM_HUMAN_AI_INVALID');
  const regionalDomains = registry.getPolicy('hierarchical').configureDomains({
    regions: [{ regionId: 'north', members: ['n1'], localFields: ['north.state'] }, { regionId: 'south', members: ['s1'] }],
    sharedContracts: [{ path: 'boundary.contract' }]
  });
  assert.deepEqual(regionalDomains.map((domain) => domain.domainId), ['organism', 'north', 'south']);
  assert.deepEqual(regionalDomains[0].owns, ['boundary.contract']);
}

main().then(() => console.log('Syncytium variant policy checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
