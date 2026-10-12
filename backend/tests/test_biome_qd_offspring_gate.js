'use strict';

const assert = require('node:assert/strict');
const qualityDiversity = require('../src/services/biome/variants/qualityDiversityController');

const archive = {
  '0.2:0.2': { cell: '0.2:0.2', descriptor: [0.2, 0.2], quality: 0.9, strategy: 'elite-a' },
  '0.8:0.8': { cell: '0.8:0.8', descriptor: [0.8, 0.8], quality: 0.8, strategy: 'elite-b' }
};
const state = { qualityDiversity: archive, offspringQueue: [] };
const input = { descriptor: [0.2, 0.2], quality: 0.1, strategy: 'rejected', evidenceRefs: ['test:quality'] };

const rejected = qualityDiversity.advance({ tick: 4 }, state, input);
assert.equal(rejected.decision.accepted, false);
assert.equal(rejected.action.type, 'QD_CANDIDATE_REJECTED');
assert.equal(rejected.decision.offspringStrategy, null);
assert.deepEqual(rejected.state.offspringQueue, []);
assert.deepEqual(rejected.state.qualityDiversity['0.2:0.2'], archive['0.2:0.2']);

const accepted = qualityDiversity.advance({ tick: 5 }, state, { ...input, quality: 1, strategy: 'new-elite' });
assert.equal(accepted.decision.accepted, true);
assert.equal(accepted.state.offspringQueue.length, 1);
assert.deepEqual(accepted.decision.offspringStrategy.lineage, ['elite-b', 'new-elite']);
console.log('Biome QD offspring requires an admitted elite: PASS');
