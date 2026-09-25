'use strict';

const assert = require('node:assert/strict');
const { DEFINITIONS } = require('../src/services/morphogenesis/registry/topologyRegistry');
const { ALL_IDS } = require('../src/services/morphogenesis/topologyResolverService');
const { TOPOLOGY_IDS } = require('../src/services/morphogenesis/morphogenesisOntology');
const { MODE_CAPABILITIES } = require('../src/services/topologyCapabilityService');

const canonical = [
  'trinity', 'a_team', 'biome', 'biocenose',
  'holobionte', 'syncytium', 'rhizome', 'metapopulation'
];

assert.deepEqual(Object.keys(DEFINITIONS), canonical);
assert.deepEqual(ALL_IDS, canonical);
assert.deepEqual(TOPOLOGY_IDS, canonical);
assert.deepEqual(Object.keys(MODE_CAPABILITIES), canonical);
console.log('Morphogenesis topology inventory: PASS');
