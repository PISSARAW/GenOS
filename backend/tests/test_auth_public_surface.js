const assert = require('node:assert/strict');
const { isPublicRequest, requireAuthentication } = require('../src/middleware/auth');
const { csrfCheck } = require('../src/middleware/security');

const publicRequests = [
  ['GET', '/healthz'],
  ['GET', '/readyz'],
  ['GET', '/livez'],
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/login/password'],
  ['POST', '/api/auth/verify-token'],
  ['POST', '/api/auth/verify-override'],
  ['GET', '/api/sso/providers'],
  ['GET', '/api/sso/start/corp'],
  ['GET', '/api/sso/callback/corp'],
  ['GET', '/api/sso/saml/corp/start'],
  ['POST', '/api/sso/saml/corp/acs'],
  ['GET', '/api/security/csrf']
];

for (const [method, path] of publicRequests) {
  assert.equal(isPublicRequest(method, path), true, `${method} ${path} should remain public`);
}

const protectedRequests = [
  ['GET', '/api/auth/session'],
  ['GET', '/api/auth/keys'],
  ['DELETE', '/api/auth/keys/key-1'],
  ['POST', '/api/auth/keys'],
  ['POST', '/api/sso/providers'],
  ['GET', '/api/sso/admin'],
  ['POST', '/api/security/csrf'],
  ['POST', '/readyz'],
  ['GET', '/readyz/extra']
];

for (const [method, path] of protectedRequests) {
  assert.equal(isPublicRequest(method, path), false, `${method} ${path} must require authentication`);
}

async function assertMiddlewareBlocksAnonymous(method, path) {
  let status;
  let continued = false;
  const req = { method, path, headers: {} };
  const res = {
    status(code) { status = code; return this; },
    json() { return this; }
  };
  await requireAuthentication(req, res, () => { continued = true; });
  assert.equal(status, 401, `${method} ${path} should reject an anonymous caller`);
  assert.equal(continued, false, `${method} ${path} should not reach its handler`);
}

async function assertCsrfProtocolException(path, shouldContinue) {
  let status;
  let continued = false;
  const req = { method: 'POST', path, headers: { origin: 'https://idp.example' } };
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  await csrfCheck(req, res, () => { continued = true; });
  assert.equal(continued, shouldContinue, `${path} CSRF behavior should match its protocol`);
  if (!shouldContinue) assert.equal(status, 403, `${path} must reject missing CSRF credentials`);
}

Promise.all([
  assertMiddlewareBlocksAnonymous('GET', '/api/auth/session'),
  assertMiddlewareBlocksAnonymous('POST', '/api/sso/providers'),
  assertMiddlewareBlocksAnonymous('POST', '/readyz'),
  assertCsrfProtocolException('/api/sso/saml/corp/acs', true),
  assertCsrfProtocolException('/api/sso/saml/corp/acs-extra', false)
]).then(() => console.log('Public route allowlist checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
