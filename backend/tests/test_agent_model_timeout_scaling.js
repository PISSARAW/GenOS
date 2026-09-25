'use strict';

const assert = require('node:assert/strict');
const { localPlanTimeoutMs } = require('../src/services/agentModelRoutingService');

const sevenB = [{ uri: 'ollama://qwen2.5-coder:7b' }];
const thirtyTwoB = [{ uri: 'ollama://qwen2.5-coder:32b' }];
assert.equal(localPlanTimeoutMs(sevenB, { timeoutMs: 120000 }), 114000);
assert.equal(localPlanTimeoutMs(thirtyTwoB, { timeoutMs: 300000 }), 240000);
console.log('Local model timeout scaling checks passed.');