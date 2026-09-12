const assert = require('node:assert/strict');
const security = require('../src/middleware/security');

function response() { return { headers: {}, setHeader(name, value) { this.headers[name] = value; }, json(value) { this.body = value; return this; } }; }

// A client-supplied X-Forwarded-Proto must not be trusted unless the operator
// explicitly declares a trusted proxy (GENOS_TRUST_PROXY=1).
delete process.env.GENOS_TRUST_PROXY;
const spoofedResponse = response();
security.issueCsrfToken({ headers: { 'x-forwarded-proto': 'https' }, secure: false, protocol: 'http' }, spoofedResponse);
assert.doesNotMatch(spoofedResponse.headers['Set-Cookie'], /; Secure/);

process.env.GENOS_TRUST_PROXY = '1';
const secureResponse = response();
security.issueCsrfToken({ headers: { 'x-forwarded-proto': 'https' }, secure: false, protocol: 'http' }, secureResponse);
assert.match(secureResponse.headers['Set-Cookie'], /; Secure/);
delete process.env.GENOS_TRUST_PROXY;

const localResponse = response();
security.issueCsrfToken({ headers: {}, protocol: 'http', secure: false }, localResponse);
assert.doesNotMatch(localResponse.headers['Set-Cookie'], /; Secure/);

const tlsResponse = response();
security.issueCsrfToken({ headers: {}, protocol: 'https', secure: true }, tlsResponse);
assert.match(tlsResponse.headers['Set-Cookie'], /; Secure/);

console.log('CSRF cookie security checks passed.');
