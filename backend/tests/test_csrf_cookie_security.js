const assert = require('node:assert/strict');
const security = require('../src/middleware/security');

function response() { return { headers: {}, setHeader(name, value) { this.headers[name] = value; }, json(value) { this.body = value; return this; } }; }
const secureResponse = response();
security.issueCsrfToken({ headers: { 'x-forwarded-proto': 'https' } }, secureResponse);
assert.match(secureResponse.headers['Set-Cookie'], /; Secure/);
const localResponse = response();
security.issueCsrfToken({ headers: {}, protocol: 'http', secure: false }, localResponse);
assert.doesNotMatch(localResponse.headers['Set-Cookie'], /; Secure/);
console.log('CSRF cookie security checks passed.');