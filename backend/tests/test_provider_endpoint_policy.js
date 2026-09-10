const assert = require('node:assert/strict');
const { validateProviderEndpoint, isLoopbackHostname, isBlockedAddress } = require('../src/services/providerEndpointPolicy');
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

// Zero/unspecified is not loopback and must be rejected for local and remote use.
assert.equal(isLoopbackHostname('0.0.0.0'), false);
assert.equal(isBlockedAddress('0.0.0.0'), true);
assert.throws(() => validateProviderEndpoint('http://0.0.0.0:11434', { localOnly: true }), /loopback/);
assert.throws(() => validateProviderEndpoint('http://0.0.0.0:11434'), /blocked/);

// Every loopback spelling must normalize to the same classification as 127.0.0.1:
// accepted as a local endpoint, refused as a remote endpoint.
const loopbackUrls = [
  'http://127.0.0.1:11434',
  'http://2130706433:11434',
  'http://0x7f.0.0.1:11434',
  'http://0x7f000001:11434',
  'http://0177.0.0.1:11434',
  'http://[::ffff:127.0.0.1]:11434',
  'http://[::ffff:7f00:1]:11434'
];
for (const url of loopbackUrls) {
  assert.doesNotThrow(() => validateProviderEndpoint(url, { localOnly: true }), `${url} must be accepted as loopback`);
  assert.throws(() => validateProviderEndpoint(url), /blocked/, `${url} must be rejected as remote`);
}
assert.equal(isLoopbackHostname('127.0.0.1'), true);
assert.equal(isLoopbackHostname('localhost'), true);
assert.equal(isLoopbackHostname('::1'), true);
assert.equal(isLoopbackHostname('[::1]'), true);
assert.equal(isLoopbackHostname('::ffff:127.0.0.1'), true);
assert.equal(isLoopbackHostname('::ffff:7f00:1'), true);
assert.equal(isLoopbackHostname('2130706433'), true);
assert.equal(isBlockedAddress('127.0.0.1'), false);
assert.equal(isBlockedAddress('::ffff:127.0.0.1'), false);

// Embedded, mapped, translated and NAT64 private/metadata targets resolve to
// the same blocked classification as their dotted-quad equivalents.
assert.equal(isBlockedAddress('::ffff:10.0.0.1'), true);
assert.equal(isBlockedAddress('::ffff:169.254.169.254'), true);
assert.equal(isBlockedAddress('::ffff:192.168.1.1'), true);
assert.equal(isBlockedAddress('::ffff:0:169.254.169.254'), true);
assert.equal(isBlockedAddress('64:ff9b::169.254.169.254'), true);
assert.equal(isBlockedAddress('::'), true);
assert.equal(isBlockedAddress('fe80::1'), true);
assert.equal(isBlockedAddress('fc00::1'), true);
for (const host of ['10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', 'metadata.google.internal', '100.100.100.200']) {
  assert.equal(isBlockedAddress(host), true, `${host} must be blocked`);
}
for (const url of ['http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.16.0.1/', 'http://169.254.169.254/latest', 'http://metadata.google.internal/', 'http://[::ffff:10.0.0.1]/']) {
  assert.throws(() => validateProviderEndpoint(url), /blocked/, `${url} must be rejected`);
}

// Legitimate public endpoints still pass.
for (const url of ['https://api.openai.com/v1/chat/completions', 'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent', 'http://8.8.8.8/']) {
  assert.doesNotThrow(() => validateProviderEndpoint(url), `${url} must be accepted`);
}

console.log('Provider endpoint policy checks passed.');
