const assert = require('node:assert/strict');
const { getCapabilityMaturity, annotateCapability } = require('../src/services/capabilityMaturity');

assert.equal(getCapabilityMaturity('cas_gc'), 'implemented');
assert.equal(getCapabilityMaturity('replicate'), 'heuristic');
assert.equal(annotateCapability('speciate', { success: true }).verified, false);
console.log('Capability results expose maturity and verification state.');
