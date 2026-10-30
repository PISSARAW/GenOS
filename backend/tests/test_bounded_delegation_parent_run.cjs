'use strict';
process.env.GENOS_DISABLE_DOTENV = '1'; process.env.GENOS_DB_BACKUP_SKIP = '1'; process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const bounded = require('../src/services/agents/boundedDelegationAuthority');
const ledger = require('../src/services/gvxDevelopmentLedger');

async function legacyBinding(db) {
  await require('./test_bounded_worker_delegation').addChild(db, { id: 'legacy-child', tokens: 1000 });
  const append = ledger.appendEvent;
  ledger.appendEvent = (database, event) => {
    const { parentRunId: omitted, ...binding } = event.payload.binding;
    return append(database, { ...event, payload: { ...event.payload, binding } });
  };
  try { await bounded.bind(db, { parentId: 'delegation-sub', childId: 'legacy-child', allocation: 1000 }); }
  finally { ledger.appendEvent = append; }
  assert.equal((await bounded.parentForChild(db, { parentId: 'delegation-sub', childId: 'legacy-child' })).missionId, 'delegation-mission');
}

async function secondRun(db, workspace) {
  const contractRecord = await require('../src/services/strategyContractService').getLatestContract(db, 'delegation-root');
  const run = await require('../src/services/strategyExecutionService').createExecutionRun(db, {
    agentId: 'delegation-sub', contractRecord, missionId: 'delegation-mission', budget: { tokens: 10000, latencyMs: 300000 } });
  await require('../src/services/missionEnvelopeAuthority').seal({ db, agentId: 'delegation-sub', executionRun: run,
    contractRecord, autonomyPlan: {}, executable: process.execPath, normalizedMission: {
      agentId: 'delegation-sub', missionId: 'delegation-mission', workspaceRoot: workspace,
      toolLease: ['genos_delegate_worker'], timeoutMs: 300000 } });
  return run;
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-parent-run-'));
  const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'fixture.txt'), 'Parent run context fixture');
  Object.assign(process.env, { GENOS_DB_PATH: path.join(root, 'test.db'), GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'), GENOS_WORKSPACES_ROOT: root });
  const db = await getDatabase();
  try {
    await require('./test_bounded_worker_delegation').seed(db, workspace);
    const old = await bounded.parent(db, 'delegation-sub');
    await legacyBinding(db);
    const fresh = await secondRun(db, workspace);
    await assert.rejects(bounded.parent(db, 'delegation-sub'), { code: 'EXECUTION_AUTHORITY_RUN_REQUIRED' });
    await assert.rejects(bounded.parentForChild(db, { parentId: 'delegation-sub', childId: 'legacy-child' }), { code: 'DELEGATION_PARENT_RUN_UNBOUND' });
    assert.equal((await bounded.parent(db, 'delegation-sub', fresh.id)).runId, fresh.id);
    await db.run("UPDATE strategy_execution_runs SET status='failed' WHERE id=?", old.runId);
    await assert.rejects(bounded.parent(db, 'delegation-sub', old.runId), { code: 'DELEGATION_PARENT_RUN_TERMINAL' });
    await require('../src/services/missionIdentityService').setStatus(db, 'delegation-mission', 'cancelled');
    await assert.rejects(bounded.parent(db, 'delegation-sub', fresh.id), { code: 'EXECUTION_AUTHORITY_MISSION_INACTIVE' });
  } finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects(); await closeDatabase();
  }
  console.log('Explicit live delegation parent run and legacy ambiguity refusal: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
