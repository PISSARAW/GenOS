'use strict';

const assert = require('node:assert/strict');
const policy = require('../src/services/agow/agowMechanismPolicyService');

assert.equal(policy.DEFAULT_POLICY.allostasis, 'shadow');
assert.equal(policy.DEFAULT_POLICY.allostaticMorphogenesis, 'disabled');
assert.equal(policy.controlsAllostasis('shadow'), false);
assert.equal(policy.controlsAllostasis('bounded'), true);
assert.equal(policy.advisesMorphogenesis('disabled'), false);
assert.equal(policy.advisesMorphogenesis('shadow'), true);
assert.equal(policy.advisesMorphogenesis('bounded'), true);
assert.equal(policy.validPolicy({ allostasis: 'bounded', allostaticMorphogenesis: 'shadow' }), true);
assert.equal(policy.validPolicy({ allostasis: 'automatic' }), false);
console.log('✅ AGOW allostasis rollout modes and safe defaults passed');
