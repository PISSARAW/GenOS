const assert = require('node:assert/strict');
const { validateProviderEndpoint } = require('../src/services/providerEndpointPolicy');
const modelProvider = require('../src/services/modelProvider');

assert.equal(validateProviderEndpoint('http://127.0.0.1:11434/v1/chat/completions', { localOnly: true }).hostname, '127.0.0.1');
assert.throws(() => validateProviderEndpoint('http://169.254.169.254/latest', { localOnly: true }), /loopback/);
assert.throws(() => validateProviderEndpoint('http://user:pass@example.com/v1/chat/completions', {}), /credentials/);
assert.throws(() => modelProvider.modelConfiguration('openai-compatible://model'), /OPENAI_COMPATIBLE_ENDPOINT/);
const previous = process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT;
process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT = 'http://169.254.169.254/latest';
assert.throws(() => modelProvider.modelConfiguration('openai-compatible://model'), /blocked/);
if (previous === undefined) delete process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT;
else process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT = previous;
console.log('Provider endpoint policy checks passed.');
