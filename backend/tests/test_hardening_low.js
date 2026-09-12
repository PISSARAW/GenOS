const assert = require('node:assert/strict');

const dbModule = require('../src/db');
const original = dbModule.getDatabase;
dbModule.getDatabase = async () => ({ get: async () => null, all: async () => [], run: async () => ({ changes: 1 }) });

const auth = require('../src/controllers/authController');
const { buildSessionPrincipal } = require('../src/middleware/sessionPrincipal');
const security = require('../src/middleware/security');

function response() {
  return {
    code: 200,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

(async () => {
  const badAll = response();
  await auth.createKey({ body: { label: 'k', role: 'operator', permissions: ['all'] } }, badAll);
  assert.equal(badAll.code, 400);
  assert.equal(badAll.body.error.code, 'INVALID_PERMISSIONS');

  const bogus = response();
  await auth.createKey({ body: { label: 'k', role: 'operator', permissions: ['bogus:perm'] } }, bogus);
  assert.equal(bogus.code, 400);

  const good = response();
  await auth.createKey({ body: { label: 'k', role: 'operator', permissions: ['read'] } }, good);
  assert.equal(good.code, 201);

  assert.deepEqual(buildSessionPrincipal({ role: 'unknown', id: 's1' }, { admin: ['all'], viewer: ['read'] }).permissions, []);

  const headerRes = response();
  security.securityHeaders({}, headerRes, () => {});
  assert.equal(headerRes.headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(headerRes.headers['Content-Security-Policy'].includes("script-src 'self' 'unsafe-inline'"), false);

  delete process.env.GENOS_TRUST_PROXY;
  const cookieRes = response();
  security.issueCsrfToken({ headers: { 'x-forwarded-proto': 'https' }, secure: false, protocol: 'http' }, cookieRes);
  assert.equal(cookieRes.headers['Set-Cookie'].includes('Secure'), false, 'forwarded-proto is not trusted by default');

  process.env.GENOS_TRUST_PROXY = '1';
  const trustedRes = response();
  security.issueCsrfToken({ headers: { 'x-forwarded-proto': 'https' }, secure: false, protocol: 'http' }, trustedRes);
  assert.equal(trustedRes.headers['Set-Cookie'].includes('Secure'), true, 'trusted proxy enables Secure cookies');

  console.log('Low-severity hardening checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  delete process.env.GENOS_TRUST_PROXY;
  dbModule.getDatabase = original;
});
