'use strict';

const assert = require('assert');
const identity = require('../src/services/proceduralIdentityService');

function makeOrg(overrides = {}) {
  return {
    apiVersion: 'genos/v1alpha1',
    kind: 'ProceduralOrganism',
    metadata: { id: 'test-org', version: 1, parentId: null, lineageId: 'lineage-1' },
    structure: {
      nodes: [{ id: 'inspect', type: 'action' }, { id: 'patch', type: 'action' }],
      synapses: [{ from: 'inspect', to: 'patch', type: 'excitatory', weight: 1.0 }],
    },
    ...overrides,
  };
}

// Test structureHash reproductible
const org1 = makeOrg({
  structure: {
    nodes: [{ id: 'inspect', type: 'action' }, { id: 'patch', type: 'action' }],
    synapses: [{ from: 'inspect', to: 'patch', type: 'excitatory', weight: 1.0 }],
  },
});

const org2 = makeOrg({
  structure: {
    nodes: [{ id: 'patch', type: 'action' }, { id: 'inspect', type: 'action' }],
    synapses: [{ from: 'inspect', to: 'patch', type: 'excitatory', weight: 1.0 }],
  },
});

const hash1 = identity.structureHash(org1);
const hash2 = identity.structureHash(org2);
assert.strictEqual(hash1, hash2);

const org3 = makeOrg({
  structure: {
    nodes: [{ id: 'inspect', type: 'action' }, { id: 'reproduce', type: 'action' }, { id: 'patch', type: 'action' }],
    synapses: [{ from: 'inspect', to: 'reproduce', type: 'excitatory', weight: 1.0 }],
  },
});

const hash3 = identity.structureHash(org3);
assert.notStrictEqual(hash1, hash3);

const validation = identity.validateOrganism(org1);
assert.strictEqual(validation.valid, false, 'unsealed organism must be invalid');
assert.ok(validation.errors.includes('metadata.structureHash is required'));

const goodOrg = makeOrg({ metadata: { id: 'test', version: 1, parentId: null, lineageId: 'l1' } });
const goodValidation = identity.validateOrganism(goodOrg);
assert.strictEqual(goodValidation.valid, false, 'unsealed organism must be invalid');

// sealOrganism(): derive identity from content, pure function
const org1Copy = JSON.parse(JSON.stringify(org1));
const sealedOrg = identity.sealOrganism(org1);
assert.strictEqual(JSON.stringify(org1Copy), JSON.stringify(org1), 'sealOrganism must not mutate input');
assert.ok(sealedOrg.metadata.structureHash);
assert.ok(sealedOrg.metadata.stateHash);
assert.ok(sealedOrg.metadata.id);
const sealedValidation = identity.validateOrganism(sealedOrg);
assert.strictEqual(sealedValidation.valid, true, `sealed organism must be valid: ${sealedValidation.errors.join(', ')}`);

// validateOrganism() must be pure — no silent repair
const sealedFrozen = JSON.parse(JSON.stringify(sealedOrg));
identity.validateOrganism(sealedOrg);
assert.strictEqual(JSON.stringify(sealedFrozen), JSON.stringify(sealedOrg), 'validateOrganism must not mutate');

// Tampered hashes must be detected (cryptographic invariant)
const tamperedStructure = JSON.parse(JSON.stringify(sealedOrg));
tamperedStructure.metadata.structureHash = 'deadbeefdeadbeef';
assert.strictEqual(identity.validateOrganism(tamperedStructure).valid, false, 'tampered structureHash must fail');

const tamperedState = JSON.parse(JSON.stringify(sealedOrg));
tamperedState.metadata.stateHash = 'deadbeefdeadbeef';
assert.strictEqual(identity.validateOrganism(tamperedState).valid, false, 'tampered stateHash must fail');

const rogueNode = JSON.parse(JSON.stringify(sealedOrg));
rogueNode.structure.nodes.push({ id: 'rogue', type: 'action' });
assert.strictEqual(identity.validateOrganism(rogueNode).valid, false, 'structure modified without re-sealing must fail');

const occId = identity.createOccurrenceId('test');
assert.ok(occId.startsWith('test-'));
assert.ok(occId.length > 20);

const ep1 = identity.canonicalEpisode({ trajectory: ['a', 'b', 'c'], outcome: 'success', context: { x: 1 } });
const ep2 = identity.canonicalEpisode({ trajectory: ['c', 'b', 'a'], outcome: 'success', context: { x: 1 } });
assert.notStrictEqual(identity.episodeHash(ep1), identity.episodeHash(ep2));

const ep3 = identity.canonicalEpisode({ trajectory: ['a', 'b'], outcome: 'failure', context: {} });
assert.notStrictEqual(identity.episodeHash(ep1), identity.episodeHash(ep3));

const sameEp1 = identity.canonicalEpisode({ trajectory: ['a', 'b', 'c'], outcome: 'success', context: { x: 1 } });
const sameEp2 = identity.canonicalEpisode({ trajectory: ['a', 'b', 'c'], outcome: 'success', context: { x: 1 } });
assert.strictEqual(identity.episodeHash(sameEp1), identity.episodeHash(sameEp2));

const stateHash1 = identity.stateHash(org1);
const stateHash2 = identity.stateHash(org1);
assert.strictEqual(stateHash1, stateHash2);

const orgWithState = { ...org1, plasticity: { lastEpisode: 50 }, fitness: { score: 0.9 } };
const stateHash3 = identity.stateHash(orgWithState);
assert.notStrictEqual(stateHash1, stateHash3);

const versionId1 = identity.versionId(org1);
const versionId2 = identity.versionId(org1);
assert.strictEqual(versionId1, versionId2);

console.log('=== procedural identity: all passed ===');
