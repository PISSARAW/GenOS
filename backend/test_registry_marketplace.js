const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabase, closeDatabase } = require('./src/db');
const registry = require('./src/controllers/registryController');

function response() { return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
async function call(handler, req) { const res = response(); await handler(req, res, error => { throw error; }); return res; }

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-registry-'));
  const db = await getDatabase(path.join(directory, 'registry.db'));
  const suffix = crypto.randomUUID();
  const org = `org-${suffix}`; const projectA = `project-a-${suffix}`; const projectB = `project-b-${suffix}`;
  await db.run('INSERT INTO organizations(id,name) VALUES(?,?)', org, org);
  await db.run('INSERT INTO projects(id,organization_id,name) VALUES(?,?,?)', projectA, org, projectA);
  await db.run('INSERT INTO projects(id,organization_id,name) VALUES(?,?,?)', projectB, org, projectB);
  const tenantA = { organizationId: org, projectId: projectA };
  const tenantB = { organizationId: org, projectId: projectB };
  const created = await call(registry.create, { params: { kind: 'workflow' }, body: { name: 'Research flow', manifest: { nodes: ['retrieve'] }, labels: ['rag'] }, tenant: tenantA });
  assert.equal(created.code, 201);
  const version = await call(registry.addVersion, { params: { id: created.body.id }, body: { manifest: { nodes: ['retrieve', 'judge'] } }, tenant: tenantA });
  assert.equal(version.body.version, 2);
  const listing = await call(registry.publish, { params: { id: created.body.id }, body: { slug: `research-${suffix}` }, tenant: tenantA });
  const market = await call(registry.marketplace, { tenant: tenantB });
  assert.equal(market.body.some(item => item.id === listing.body.id), true);
  const install = await call(registry.install, { params: { id: listing.body.id }, tenant: tenantB });
  assert.equal(install.body.installedVersion, 2);
  const scoped = await call(registry.list, { params: {}, tenant: tenantB });
  assert.equal(scoped.body.length, 0);
  await closeDatabase(); fs.rmSync(directory, { recursive: true, force: true });
  console.log('registry marketplace checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
