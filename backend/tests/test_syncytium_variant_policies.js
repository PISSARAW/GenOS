'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const registry = require('../src/services/syncytium/variants/variantPolicyRegistry');

async function main() {
  const ids = syncytium.listVariantPolicies().map((policy) => policy.id);
  assert.equal(ids.length, 12);
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
  assert.deepEqual(registry.POLICY_PRIORITY, ['code', 'graph', 'transactional', 'speculative', 'hierarchical']);
  assert.throws(() => registry.getPolicy('missing'), (error) => error.code === 'SYNCYTIUM_VARIANT_POLICY_UNKNOWN');

  const session = await syncytium.createPolicySession('Refactor shared code with tests.', { variantId: 'code' });
  assert.equal(session.variantPolicy.id, 'code');
  assert.equal(session.variantPolicy.consistencyZones.files, 'INVARIANT_PRESERVING');
  const graphPolicy = registry.getPolicy('graph');
  assert.deepEqual(Object.keys(graphPolicy.configureSchema({}).fields), ['graph_nodes', 'graph_edges']);
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
