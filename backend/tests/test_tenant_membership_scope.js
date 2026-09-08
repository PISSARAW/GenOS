const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const original = dbModule.getDatabase;
let sql;
dbModule.getDatabase = async () => ({ get: async (query) => { sql = query; return query.includes('FROM projects') ? { id: 'p', organization_id: 'o', status: 'active' } : null; } });
const { resolveTenant } = require('../src/middleware/tenant');
(async () => {
  const result = await resolveTenant({ headers: { 'x-organization-id': 'o', 'x-project-id': 'p' }, user: { keyId: 'principal', permissions: [], isAuthenticated: true } });
  assert.equal(result, null);
  assert.ok(sql.includes('pm.project_id IS NOT NULL'));
  console.log('Tenant membership scope checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = original; });
