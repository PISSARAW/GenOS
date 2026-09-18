const assert = require('node:assert/strict');
const exosome = require('../src/services/selectiveExosomeService');

const packet = exosome.createExosome({ capability: 'security', ttlMs: 1000, signal: { kind: 'risk' } });
assert.equal(exosome.uptake([packet], { id: 'worker', capabilities: ['security'] }).length, 1);
assert.equal(exosome.uptake([packet], { id: 'worker', capabilities: ['frontend'] }).length, 0);
assert.equal(exosome.isEligible(exosome.createExosome({ recipientAgentId: 'other' }), { id: 'worker' }), false);
console.log('Selective exosome checks passed.');
