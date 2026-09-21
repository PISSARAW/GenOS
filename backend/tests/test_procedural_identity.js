'use strict';

const assert = require('assert');
const identity = require('../src/services/proceduralIdentityService');

// Test contentHash reproductible
const org1 = {
  structure: {
    nodes: [{ id: 'inspect' }, { id: 'patch' }],
    synapses: [{ from: 'inspect', to: 'patch', type: 'excitatory' }],
  },
};

const org2 = {
  structure: {
    nodes: [{ id: 'patch' }, { id: 'inspect' }],
    synapses: [{ from: 'inspect', to: 'patch', type: 'excitatory' }],
  },
};

const hash1 = identity.contentHash(org1);
const hash2 = identity.contentHash(org2);
assert.strictEqual(hash1, hash2);

const org3 = {
  structure: {
    nodes: [{ id: 'inspect' }, { id: 'reproduce' }, { id: 'patch' }],
    synapses: [{ from: 'inspect', to: 'reproduce', type: 'excitatory' }],
  },
};

const hash3 = identity.contentHash(org3);
assert.notStrictEqual(hash1, hash3);

const assigned = identity.assignId(org1);
assert.strictEqual(assigned.metadata.id, hash1);

const validation = identity.validateId(assigned);
assert.strictEqual(validation.valid, true);

const badOrg = { ...assigned, metadata: { ...assigned.metadata.id, id: 'wrong' } };
const badValidation = identity.validateId(badOrg);
assert.strictEqual(badValidation.valid, false);

const occId = identity.createOccurrenceId('test');
assert.ok(occId.startsWith('test-'));
assert.ok(occId.length > 20);

const ep1 = identity.canonicalEpisode({ trajectory: ['a', 'b', 'c'], outcome: 'success', context: { x: 1 } });
const ep2 = identity.canonicalEpisode({ trajectory: ['c', 'b', 'a'], outcome: 'success', context: { x: 1 } });
assert.strictEqual(identity.episodeHash(ep1), identity.episodeHash(ep2));

const ep3 = identity.canonicalEpisode({ trajectory: ['a', 'b'], outcome: 'failure', context: {} });
assert.notStrictEqual(identity.episodeHash(ep1), identity.episodeHash(ep3));

console.log('=== procedural identity: all passed ===');
