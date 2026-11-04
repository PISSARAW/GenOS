'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-native-controller-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'problem.json'), '{"values":[4,9,8],"target":17}');
  await fs.writeFile(path.join(workspace, 'allocation.json'), '{"indices":[0,1]}');
  Object.assign(process.env, { GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_PATH: path.join(root, 'test.sqlite'), GENOS_STUDIO_ROOT: path.join(root, 'studio'),
    GENOS_CAPSULE_ROOT: path.join(root, 'capsules'), GENOS_WORKSPACES_ROOT: root,
    GENOS_DISABLE_WORKSPACE_GC: '1', GENOS_ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'),
    GENOS_EPISTEMIC_RECEIPT_SECRET: crypto.randomBytes(32).toString('hex'),
    GENOS_GVX_LEDGER_HMAC_SECRET: crypto.randomBytes(32).toString('hex') });
  const native = require('./helpers/workerCooperationNativeMission.cjs');
  await native.prepareCatalog(root);
  const database = require('../src/db');
  const db = await database.getDatabase();
  const context = { root, workspace, id: `controller-${crypto.randomUUID()}`,
    model: 'ollama://unused-no-model-call', db, report: { stages: [] } };
  try {
    await native.prepare(context, { tokens: 68096, costUsd: 1, events: 400, latencyMs: 720000 });
    const ctx = context.control.ctx;
    const lease = await db.get('SELECT * FROM mission_execution_authority WHERE mission_id=?', context.id);
    assert.equal(lease.state, 'running');
    assert.equal(lease.owner_pid, process.pid);
    assert.equal(ctx.normalizedMission.missionExecutionAuthority.generation, lease.generation);
    await assert.rejects(require('../src/services/nativeMissionController').prepare(ctx.normalizedMission),
      { code: 'MISSION_AUTHORITY_STALE' });
    assert.equal((await require('../src/services/missionEnvelopeAuthority').assertRun(db, {
      agentId: context.id, runId: ctx.executionRun.id, mission: ctx.normalizedMission })).status, 'authorized');
    assert.equal(ctx.autonomyPlan.scheduling.mode, 'observation-gated');
    assert.equal(ctx.autonomyPlan.localModelReview.consulted, false);
    assert.ok(ctx.orchestratorBody && ctx.protocolBinding);
    console.log('Native coordinator: bootstrap, body, sealed authority, claimed owner and concurrent launch refusal PASS; no LLM call.');
  } finally {
    await require('./helpers/workerCooperationShutdown.cjs').stop(db, context.id);
    await database.closeDatabase();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
