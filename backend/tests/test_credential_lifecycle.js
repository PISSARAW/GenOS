const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const original = dbModule.getDatabase;
const statements = [];
dbModule.getDatabase = async () => ({
  get: async (sql) => sql.includes('label') ? { label: 'old', role: 'operator', permissions: '["read"]', expires_at: null } : null,
  run: async (sql) => { statements.push(sql); return { changes: 1 }; }
});
const auth = require('../src/controllers/authController');
const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
(async () => {
  const revoke = response(); await auth.revokeKey({ params: { id: 'key-old' } }, revoke, () => {}); assert.equal(revoke.body.revoked, true);
  const rotate = response(); await auth.rotateKey({ params: { id: 'key-old' } }, rotate, (e) => { throw e; }); assert.equal(rotate.code, 201); assert.notEqual(rotate.body.key.rawKey, undefined); assert.ok(statements.some((sql) => sql.includes('is_active = 0')));
  const session = response(); await auth.revokeSession({ params: { id: 'session-old' } }, session, () => {}); assert.equal(session.body.revoked, true);
  console.log('Credential lifecycle checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = original; });
