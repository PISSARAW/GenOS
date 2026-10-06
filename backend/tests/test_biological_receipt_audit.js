'use strict';
const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { workerSchema, addWorker, completion } = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const queries = require('../src/services/biologicalReceiptQueryService');
const { missionBelongsToTenant } = require('../src/controllers/biologicalReceiptController');

async function tenant(db) {
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('workspace', 'org', 'project');
    UPDATE agents SET workspace_id = 'workspace';`);
  assert.ok(await missionBelongsToTenant(db, 'worker-mission', { organizationId: 'org', projectId: 'project' }));
  assert.equal(await missionBelongsToTenant(db, 'worker-mission', { organizationId: 'other', projectId: 'project' }), undefined);
}

async function main() {
  const db = openDatabase();
  try {
    await workerSchema(db);
    const contractRecord = await addWorker(db);
    const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord });
    const saved = await execution.recordExecutionEvent(db, 'worker', completion(run.id));
    const audit = await queries.missionAudit(db, { missionId: 'worker-mission' });
    assert.equal(audit.schema, 'genos.biological-mission-audit/v1');
    assert.equal(audit.workerReceipts[0].payloadHash, saved.biologicalReceipt.payloadHash);
    assert.equal(audit.workerBindings[0].genomeHash, saved.biologicalReceipt.genomeHash);
    assert.equal(audit.activeAuthority, null);
    assert.equal((await queries.missionAudit(db, { missionId: 'other' })).workerReceipts.length, 0);
    assert.throws(() => queries.queryLimit('1000'), { code: 'BIOLOGICAL_RECEIPT_QUERY_INVALID' });
    await tenant(db);
  } finally { await db.close(); }
  console.log('Read-only biological audit, frozen genome lookup, bounded history and tenant isolation passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
