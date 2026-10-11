'use strict';

const assert = require('node:assert/strict');
const { resolveMorphology } = require('../src/services/morphogenesis/morphologyResolverService');

const topologyProfile = {
  baseTopology: 'trinity',
  selectedVariant: 'controlled',
  authorityPolicies: [{ variantId: 'controlled' }],
  evidencePolicies: [{ variantId: 'controlled' }]
};
const result = resolveMorphology({
  selectedTopology: 'trinity', topologyProfile,
  missionId: 'profile-projection-test', problem: 'verify profile projection'
});
const leaf = result.graph.nodes.find((node) => node.topology === 'trinity');
assert.equal(leaf.variant, 'controlled');
assert.deepEqual(leaf.localProfile, topologyProfile);
assert.deepEqual(JSON.parse(JSON.stringify(result.graph)).nodes[0].localProfile, topologyProfile);
console.log('Morphology profile projection: PASS');
