const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabase, closeDatabase } = require('../src/db');
const { resolveTenant } = require('../src/middleware/tenant');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-tenant-'));
  const databasePath = path.join(directory, 'tenant.db');
  const token = 'tenant-test-token';
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const db = await getDatabase(databasePath);
  await db.run("INSERT INTO access_keys(id,key_hash,label,role,permissions) VALUES(?,?,?,?,?)", 'key-tenant', hash, 'tenant-user', 'operator', '["read","workspace:write"]');
  await db.run("INSERT INTO organizations(id,name) VALUES('org-test','Test Organization')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES('project-test','org-test','Test Project')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES('project-other','org-test','Other Project')");
  await db.run("INSERT INTO organization_memberships(principal_id,organization_id,role) VALUES('key-tenant','org-test','member')");
  await db.run("INSERT INTO project_memberships(principal_id,project_id,role) VALUES('key-tenant','project-test','member')");

  const valid = await resolveTenant({ headers: { authorization: `Bearer ${token}`, 'x-organization-id': 'org-test', 'x-project-id': 'project-test' } });
  assert.equal(valid.projectId, 'project-test');
  const wrongProject = await resolveTenant({ headers: { authorization: `Bearer ${token}`, 'x-organization-id': 'org-test', 'x-project-id': 'project-other' } });
  assert.equal(wrongProject, null);
  const orgMembership = await db.get('SELECT role FROM organization_memberships WHERE principal_id=? AND organization_id=?', 'key-tenant', 'org-test');
  assert.equal(orgMembership.role, 'member');
  const projectMembership = await db.get('SELECT role FROM project_memberships WHERE principal_id=? AND project_id=?', 'key-tenant', 'project-test');
  assert.equal(projectMembership.role, 'member');
  await db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES('ws-one','same-name','/tmp/one','org-test','project-test')");
  await db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES('ws-two','same-name','/tmp/two','org-test','project-other')");
  await assert.rejects(() => db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES('ws-three','same-name','/tmp/three','org-test','project-test')"), /UNIQUE/i);
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
  console.log('tenant isolation checks passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
