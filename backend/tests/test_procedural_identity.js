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
assert.strictEqual(validation.valid, true);

const goodOrg = makeOrg({ metadata: { id: 'test', version: 1, parentId: null, lineageId: 'l1' } });
const goodValidation = identity.validateOrganism(goodOrg);
assert.strictEqual(goodValidation.valid, true);

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
