'use strict';
const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { workerSchema, addWorker, completion } = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const dependency = require('../src/services/agents/delegatedDependencyContext');

async function main() {
  const db = openDatabase();
  try {
    await workerSchema(db);
    await db.run("INSERT INTO agents(id,execution_mode,parent_agent_id,workspace_id) VALUES('sub','worker','parent','worker-workspace')");
    await db.run("INSERT INTO mission_agents(mission_id,agent_id) VALUES('worker-mission','sub')");
    const record = await addWorker(db, { agentId: 'source' });
    const targetRecord = await addWorker(db, { agentId: 'target' });
    await db.run("UPDATE agents SET parent_agent_id='sub' WHERE id IN ('source','target')");
    const run = await execution.createExecutionRun(db, { agentId: 'source', contractRecord: record });
    const saved = await execution.recordExecutionEvent(db, 'source', completion(run.id));
    const input = { parentId: 'sub', sourceChildId: 'source', sourceRunId: run.id,
      childId: 'target', missionId: 'worker-mission' };
    const projected = await dependency.project(db, input);
    assert.match(projected.prompt, /Checked result/);
    assert.match(projected.prompt, /"verified":false/);
    assert.match(projected.prompt, new RegExp(saved.biologicalReceipt.payloadHash));
    assert.equal(projected.reference, `genos://worker-receipt/${saved.biologicalReceipt.receiptId}`);
    await assert.rejects(dependency.project(db, { ...input, parentId: 'foreign-parent' }), { code: 'DELEGATION_DEPENDENCY_INVALID' });
    await assert.rejects(dependency.project(db, { ...input, childId: 'source' }), { code: 'DELEGATION_DEPENDENCY_INVALID' });
    await assert.rejects(dependency.project(db, { ...input, missionId: 'foreign-mission' }), { code: 'DELEGATION_DEPENDENCY_INVALID' });
    await assert.rejects(dependency.project(db, { ...input, sourceRunId: 'foreign-run' }), { code: 'DELEGATION_DEPENDENCY_INVALID' });
    const foreignRun = await execution.createExecutionRun(db, { agentId: 'target', contractRecord: targetRecord });
    await assert.rejects(dependency.project(db, { ...input, sourceRunId: foreignRun.id }), { code: 'DELEGATION_DEPENDENCY_INVALID' });
    await db.run("INSERT INTO workspaces(id,organization_id,project_id) VALUES('foreign','other-org','other-project')");
    await db.run("UPDATE agents SET workspace_id='foreign' WHERE id='target'");
    await assert.rejects(dependency.project(db, input), { code: 'DELEGATION_DEPENDENCY_INVALID' });
    await db.run("UPDATE agents SET workspace_id='worker-workspace' WHERE id='target'");
    await db.exec('DROP TRIGGER IF EXISTS immutable_biological_worker_receipts_update');
    const triggers = await db.all("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='biological_worker_receipts'");
    for (const row of triggers) await db.exec(`DROP TRIGGER "${row.name.replace(/"/g, '""')}"`);
    await db.run("UPDATE biological_worker_receipts SET payload_hash='forged' WHERE run_id=?", run.id);
    await assert.rejects(dependency.project(db, input), { code: 'BIOLOGICAL_WORKER_INTEGRITY_MISMATCH' });
  } finally { await db.close(); }
  console.log('Delegated dependency context is bound to sibling, run, mission, scope and receipt hash: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
