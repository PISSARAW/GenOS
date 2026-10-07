'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const service = require('../src/services/complianceService');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-consumer-compliance-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD ||= 'consumer-compliance-test-only';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  try {
    const db = await getDatabase(path.join(root, 'compliance.db'));
    await db.run("INSERT INTO organizations (id, name) VALUES ('consumer-org', 'Consumer')");
    await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('consumer-project', 'consumer-org', 'Consumer')");
    await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('other-project', 'consumer-org', 'Other')");
    const scope = { organizationId: 'consumer-org', projectId: 'consumer-project' };
    const other = { ...scope, projectId: 'other-project' };
    const local = await service.buildReport({ framework: 'EU_AI_ACT', scope: null });
    const owned = await service.buildReport({ framework: 'SOC_2', scope });
    const foreign = await service.buildReport({ framework: 'HIPAA', scope: other });
    assert.equal((await service.getReport(local.id, null)).id, local.id);
    assert.equal(await service.getReport(owned.id, null), null);
    assert.equal(await service.getReport(local.id, scope), null);
    assert.equal(await service.getReport(foreign.id, scope), null);
    assert.equal((await service.getReport(owned.id, scope)).id, owned.id);
    assert.deepEqual((await service.listReports(undefined, null)).map(row => row.id), [local.id]);
    assert.deepEqual((await service.listReports(undefined, scope)).map(row => row.id), [owned.id]);
    console.log('Compliance consumer: real local and tenant reports, null administrator scope, list/read isolation: PASS');
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
