const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const original = dbModule.getDatabase;
let queries;
let projectRow;
dbModule.getDatabase = async () => ({ get: async (query) => {
  queries.push(query);
  if (query.includes('FROM projects')) return { id: 'p', organization_id: 'o', status: 'active' };
  if (query.includes('FROM project_memberships')) return projectRow;
  return null;
} });
const { resolveTenant } = require('../src/middleware/tenant');
function scopeHeaders() {
  return { headers: { 'x-organization-id': 'o', 'x-project-id': 'p' }, user: { keyId: 'principal', permissions: [], isAuthenticated: true } };
}
(async () => {
  // No membership anywhere -> no scope.
  queries = [];
  projectRow = null;
  const result = await resolveTenant(scopeHeaders());
  assert.equal(result, null);
  assert.ok(queries.some((query) => query.includes('FROM project_memberships')));
  assert.ok(!queries.some((query) => query.includes('IS NOT NULL')));
  // Direct project member without any organization row -> scope granted.
  queries = [];
  projectRow = { role: 'member' };
  const direct = await resolveTenant(scopeHeaders());
  assert.equal(direct && direct.projectId, 'p');
  assert.equal(direct && direct.role, 'member');
  console.log('Tenant membership scope checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = original; });
