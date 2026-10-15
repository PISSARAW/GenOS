'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');
const { migrateOperatorControlReceipts } =
  require('../src/db/migrations/migrateOperatorControlReceipts');
const { digest } = require('../src/services/operatorControlPersistence');

const BASE = '/api/studio/missions/mission-managed/episodes/episode-managed/threads/thread-managed';

async function requestWithToken(spec, route, options) {
  const { token, body } = options;
  const response = await fetch(spec.url + route, { method: body ? 'POST' : 'GET',
    signal: AbortSignal.timeout(5000), headers: { Authorization: `Bearer ${token}`,
      'X-Organization-Id': 'b06-org', 'X-Project-Id': 'b06-project',
      'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, value: await response.json() };
}

async function seed(spec) {
  await spec.db.run(`INSERT INTO missions (mission_id, objective, status)
    VALUES ('mission-managed', 'Managed CellThread HTTP', 'active')`);
  await migrateOperatorControlReceipts(spec.db);
  await spec.db.run(`INSERT INTO mission_episodes
    (episode_id, mission_id, organization_id, project_id, organism_revision, status)
    VALUES ('episode-managed', 'mission-managed', 'b06-org', 'b06-project',
      'organism:managed', 'active')`);
  await spec.db.run(`INSERT INTO cell_threads
    (thread_id, episode_id, mission_id, organization_id, project_id,
      worker_id, cell_kind, status, revision)
    VALUES ('thread-managed', 'episode-managed', 'mission-managed',
      'b06-org', 'b06-project', 'worker-managed', 'worker', 'waiting_signal', 0)`);
}

async function checkpointJourney(spec) {
  const missingKey = await request(spec, `${BASE}/checkpoints`, {
    body: { context: { cursor: 0 } } });
  assert.equal(missingKey.status, 400, JSON.stringify(missingKey.value));
  assert.equal(missingKey.value.error.code, 'STUDIO_CELL_IDEMPOTENCY_REQUIRED');
  const body = { idempotencyKey: 'http-checkpoint-key', context: { cursor: 21 },
    evidenceRefs: ['evidence:http'], workerId: 'worker-forged' };
  const first = await request(spec, `${BASE}/checkpoints`, { body });
  assert.equal(first.status, 200, JSON.stringify(first.value));
  assert.equal(first.value.checkpoint.workerId, 'worker-managed');
  const retry = await request(spec, `${BASE}/checkpoints`, { body });
  assert.equal(retry.status, 200, JSON.stringify(retry.value));
  assert.equal(retry.value.idempotent, true);
  assert.equal(retry.value.checkpoint.checkpointId, first.value.checkpoint.checkpointId);

  const checkpointRoute = `${BASE}/checkpoints/${first.value.checkpoint.checkpointId}`;
  const checkpointCount = (await spec.db.get(`SELECT COUNT(*) AS count
    FROM cell_thread_checkpoints`)).count;
  const read = await request(spec, checkpointRoute);
  assert.equal(read.status, 200, JSON.stringify(read.value));
  assert.deepEqual(read.value.context, { cursor: 21 });
  assert.equal((await spec.db.get(`SELECT COUNT(*) AS count
    FROM cell_thread_checkpoints`)).count, checkpointCount);
  const foreign = await request(spec, checkpointRoute, { project: 'b06-other' });
  assert.equal(foreign.status, 403, JSON.stringify(foreign.value));

  const resume = await request(spec, `${checkpointRoute}/resume`, {
    body: { idempotencyKey: 'http-resume-key' } });
  assert.equal(resume.status, 409, JSON.stringify(resume.value));
  assert.equal(resume.value.error.code, 'CELL_CHECKPOINT_RESUME_UNPROVEN');
  const target = await spec.db.get(`SELECT status, revision FROM cell_threads
    WHERE thread_id = 'thread-managed'`);
  assert.deepEqual(target, { status: 'waiting_signal', revision: 0 });
}

async function controlJourney(spec) {
  await spec.db.run(`UPDATE cell_threads SET status = 'active', revision = revision + 1
    WHERE thread_id = 'thread-managed'`);
  const missingKey = await request(spec, `${BASE}/controls/pause`, { body: {} });
  assert.equal(missingKey.status, 400, JSON.stringify(missingKey.value));
  assert.equal(missingKey.value.error.code, 'STUDIO_CELL_IDEMPOTENCY_REQUIRED');
  assert.equal((await spec.db.get(`SELECT COUNT(*) AS count
    FROM operator_control_commands`)).count, 0);
  const pause = await request(spec, `${BASE}/controls/pause`, { body: {
    idempotencyKey: 'http-pause-key', actorId: 'forged-actor', reason: 'http pause'
  } });
  assert.equal(pause.status, 409, JSON.stringify(pause.value));
  assert.equal(pause.value.error.code, 'RUNTIME_UNAVAILABLE');
  const row = await spec.db.get(`SELECT command_id, actor_id FROM operator_control_commands
    WHERE idempotency_key = 'http-pause-key'`);
  assert.equal(row.actor_id, 'b06-key');

  const receiptCount = (await spec.db.get(`SELECT COUNT(*) AS count
    FROM operator_control_receipts`)).count;
  const read = await request(spec, `${BASE}/commands/${row.command_id}`);
  assert.equal(read.status, 200, JSON.stringify(read.value));
  assert.equal(read.value.command.actorId, 'b06-key');
  assert.equal(read.value.receipt.outcome, 'rejected');
  assert.equal((await spec.db.get(`SELECT COUNT(*) AS count
    FROM operator_control_receipts`)).count, receiptCount);

  const resultCode = 'CONTROL_APPLIED_RECONCILIATION_REQUIRED';
  const requestHash = digest(JSON.stringify(['pause', 'mission-managed',
    'episode-managed', 'thread-managed', 'b06-org', 'b06-project', 'b06-key',
    'workspace:write', null]));
  const evidenceJson = '{}';
  const receiptHash = digest(['cmd-reconcile', requestHash, 'pause', 'mission-managed',
    'episode-managed', 'thread-managed', 'b06-org', 'b06-project', 'b06-key',
    'workspace:write', null, 1, 'applied', resultCode, evidenceJson].join('\0'));
  await spec.db.run(`INSERT INTO operator_control_commands
    (command_id,idempotency_key,request_hash,action,mission_id,episode_id,thread_id,
      organization_id,project_id,actor_id,authority,expected_thread_revision,
      owner_token,lease_expires_at,status,result_code,revision,finalized_at)
    VALUES ('cmd-reconcile','http-reconcile-key',?,'pause','mission-managed',
      'episode-managed','thread-managed','b06-org','b06-project','b06-key',
      'workspace:write',1,'owner-reconcile',0,'applied',?,1,CURRENT_TIMESTAMP)`,
  requestHash, resultCode);
  await spec.db.run(`INSERT INTO operator_control_receipts
    (receipt_id,command_id,outcome,result_code,evidence_json,receipt_hash)
    VALUES ('receipt-reconcile','cmd-reconcile','applied',?,'{}',?)`,
  resultCode, receiptHash);
  const reconcile = await request(spec, `${BASE}/controls/pause`, {
    body: { idempotencyKey: 'http-reconcile-key' } });
  assert.equal(reconcile.status, 409, JSON.stringify(reconcile.value));
  assert.equal(reconcile.value.error.code, resultCode);

  await spec.db.run(`UPDATE access_keys SET role = 'commander',
    permissions = '["read","workspace:write"]' WHERE id = 'b06-key'`);
  const cancel = await request(spec, `${BASE}/controls/cancel`, {
    body: { idempotencyKey: 'http-cancel-key' } });
  assert.equal(cancel.status, 403, JSON.stringify(cancel.value));
  assert.equal(cancel.value.error.code, 'FORBIDDEN');

  await spec.db.run(`UPDATE access_keys SET role = 'viewer', permissions = '["read"]'
    WHERE id = 'b06-key'`);
  const viewerRead = await request(spec, `${BASE}/commands/${row.command_id}`);
  assert.equal(viewerRead.status, 200, JSON.stringify(viewerRead.value));
}

async function sessionRefusal(spec) {
  const token = crypto.randomBytes(24).toString('hex');
  await spec.db.run(`INSERT INTO sessions
    (id, token_hash, role, username, expires_at)
    VALUES ('managed-session', ?, 'operator', 'session-operator',
      datetime('now', '+1 hour'))`, crypto.createHash('sha256').update(token).digest('hex'));
  await spec.db.run(`INSERT INTO project_memberships (principal_id, project_id, role)
    VALUES ('session-operator', 'b06-project', 'member')`);
  const checkpoint = await spec.db.get(`SELECT checkpoint_id FROM cell_thread_checkpoints
    WHERE thread_id = 'thread-managed' ORDER BY created_at LIMIT 1`);
  const read = await requestWithToken(spec, `${BASE}/checkpoints/${checkpoint.checkpoint_id}`,
    { token });
  assert.equal(read.status, 200, JSON.stringify(read.value));
  const seal = await requestWithToken(spec, `${BASE}/checkpoints`, { token,
    body: { idempotencyKey: 'session-seal-key', context: {} } });
  assert.equal(seal.status, 403, JSON.stringify(seal.value));
  assert.equal(seal.value.error.code, 'STUDIO_CELL_ACCESS_KEY_REQUIRED');
  const resume = await requestWithToken(spec,
    `${BASE}/checkpoints/${checkpoint.checkpoint_id}/resume`, { token,
      body: { idempotencyKey: 'session-checkpoint-resume-key' } });
  assert.equal(resume.status, 403, JSON.stringify(resume.value));
  assert.equal(resume.value.error.code, 'STUDIO_CELL_ACCESS_KEY_REQUIRED');
  const response = await requestWithToken(spec, `${BASE}/controls/resume`, { token,
    body: { idempotencyKey: 'session-resume-key' } });
  assert.equal(response.status, 403, JSON.stringify(response.value));
  assert.equal(response.value.error.code, 'STUDIO_CELL_ACCESS_KEY_REQUIRED');
  assert.equal((await spec.db.get(`SELECT COUNT(*) AS count FROM operator_control_commands
    WHERE idempotency_key = 'session-resume-key'`)).count, 0);
}

async function main() {
  await withFixture(async spec => {
    await seed(spec);
    await checkpointJourney(spec);
    await controlJourney(spec);
    await sessionRefusal(spec);
  });
  console.log('Studio managed CellThread authenticated HTTP checks: PASS');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
