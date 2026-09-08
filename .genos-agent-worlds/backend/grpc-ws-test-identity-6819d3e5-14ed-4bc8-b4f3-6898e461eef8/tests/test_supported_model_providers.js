const assert = require('node:assert/strict');
const modelProvider = require('../src/services/modelProvider');

assert.equal(modelProvider.isSupportedProvider('openai'), true);
assert.equal(modelProvider.isSupportedProvider('openai-compatible'), true);
assert.equal(modelProvider.isSupportedProvider('invalid-provider'), false);
assert.equal(modelProvider.isSupportedProvider(' OpenAI '), true);
console.log('Provider registration uses the runtime provider allowlist.');