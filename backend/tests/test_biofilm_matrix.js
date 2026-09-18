const assert = require('node:assert/strict');
const matrix = require('../src/services/biofilmMatrixService');
const biome = require('../src/services/biomeCoordinationService');

const state = matrix.createMatrix('biome-test');
matrix.deposit(state, { key: 'risk-1', kind: 'risk', clusterId: 'c1', value: 'high' });
matrix.deposit(state, { key: 'proof-1', kind: 'proof', clusterId: 'c2', value: 'verified' });
assert.equal(matrix.read(state, { clusterId: 'c1' }).length, 1);
assert.equal(matrix.read(state, { afterVersion: 1 })[0].key, 'proof-1');
assert.equal(biome.composeBiome('test', { agentCount: 100 }).matrix.entries.size, 0);
console.log('Biofilm matrix checks passed.');
