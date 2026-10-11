'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'p1-authority-test-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { openDatabase } = require('./helpers/biologyDatabase');
const fixture = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const authority = require('../src/services/missionEnvelopeAuthority');
const launchAuthority = require('../src/services/missionExecutionAuthority');

async function seed(db) {
  await fixture.workerSchema(db);
  await db.exec(`ALTER TABLE agents ADD COLUMN status TEXT;
    ALTER TABLE agents ADD COLUMN isolation_mode TEXT;
    CREATE TABLE aeis_agent_dissonance (agent_id TEXT PRIMARY KEY, authority_level INTEGER);`);
  const contractRecord = await fixture.addWorker(db);
  await db.exec('ALTER TABLE mission_agents ADD COLUMN role TEXT');
  await launchAuthority.rotate(db, { missionId: 'worker-mission', agentId: 'parent', forceRotate: true });
  return contractRecord;
}

async function context(db, root, options) {
  const { contractRecord, duration = 300000, agentId = 'worker' } = options;
  const run = await execution.createExecutionRun(db, { agentId, contractRecord,
    missionId: 'worker-mission', budget: { tokens: 0, deterministic: true, latencyMs: duration } });
  const ctx = { db, agentId, executionRun: run, autonomyPlan: {}, normalizedMission: {
    agentId, missionId: 'worker-mission', workspaceRoot: root, toolLease: ['genos_search_failures'], timeoutMs: duration } };
  await authority.seal(ctx);
  return ctx;
}

function input(ctx) { return { agentId: ctx.agentId, runId: ctx.executionRun.id, mission: ctx.normalizedMission }; }

async function immutableAndFresh(ctx, filename) {
  const saved = await authority.read(ctx.db, ctx.executionRun.id);
  const replay = await authority.seal(ctx);
  assert.equal(replay.hash, saved.hash);
  assert.equal(JSON.stringify(saved).includes('"token":'), false);
  assert.equal((await authority.assertRun(ctx.db, input(ctx))).status, 'authorized');
  const body = await require('../src/services/orchestratorBodyAuthority').bind(ctx, {
    percepts: [{ kind: 'metabolic_budget', sensorOwnerAgentId: 'spoofed', observedDomain: 'self' }]
  });
  assert.equal(body.percepts[0].sensorOwnerAgentId, 'worker');
  assert.equal(body.percepts[0].ownerAuthorityHash, saved.hash);
  assert.equal(body.percepts[0].observationAttested, false);
  const query = { agentId: ctx.agentId, runId: ctx.executionRun.id, scope: saved.envelope.scope };
  const view = await authority.inspect(ctx.db, query);
  assert.equal(view.current.status, 'authorized');
  assert.equal(view.postconditions, 'not_evaluated');
  await assert.rejects(authority.inspect(ctx.db, { ...query, scope: { ...query.scope, projectId: 'foreign' } }),
    { code: 'EXECUTION_AUTHORITY_INSPECTION_SCOPE_MISMATCH' });
  const script = `process.env.GENOS_DISABLE_DOTENV='1';const db=require('./backend/tests/helpers/biologyDatabase').openDatabase(process.argv[1]);
    require('./backend/src/services/missionEnvelopeAuthority').assertRun(db,JSON.parse(process.argv[2]))
    .then(result=>console.log(JSON.stringify({status:result.status,hash:result.hash}))).finally(()=>db.close());`;
  const child = spawnSync(process.execPath, ['-e', script, filename, JSON.stringify(input(ctx))],
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { status: 'authorized', hash: saved.hash });
  const widened = structuredClone(ctx.normalizedMission);
  widened.toolLease.push('genos_fork');
  await assert.rejects(authority.assertRun(ctx.db, { ...input(ctx), mission: widened }), { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  const rootChanged = { ...ctx.normalizedMission, workspaceRoot: path.dirname(ctx.normalizedMission.workspaceRoot) };
  await assert.rejects(authority.assertRun(ctx.db, { ...input(ctx), mission: rootChanged }), { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  await assert.rejects(authority.assertRun(ctx.db, { ...input(ctx), agentId: 'parent' }), { code: 'EXECUTION_AUTHORITY_ACTOR_MISMATCH' });
  await assert.rejects(authority.assertTool(ctx.db, { agentId: 'worker', toolName: 'genos_fork' }), { code: 'EXECUTION_AUTHORITY_TOOL_DENIED' });
  assert.equal((await authority.assertTool(ctx.db, { agentId: 'worker', toolName: 'genos_search_failures' })).status, 'authorized');
  const bodyReceipts = require('../src/services/bodyActionReceiptService');
  const bodyInput = { db: ctx.db, agentId: 'worker', runId: ctx.executionRun.id,
    actionId: 'sealed-worker-action', effectorId: 'mission_runtime_process' };
  assert.equal((await bodyReceipts.predict(bodyInput)).phase, 'predicted');
  assert.equal((await bodyReceipts.predict(bodyInput)).phase, 'predicted');
  await assert.rejects(bodyReceipts.predict({ ...bodyInput, prediction: { changed: true } }),
    { code: 'BODY_ACTION_IDENTITY_COLLISION' });
  await assert.rejects(bodyReceipts.predict({ ...bodyInput, effectorId: 'worker_dispatch' }),
    { code: 'BODY_ACTION_IDENTITY_COLLISION' });
  assert.equal((await bodyReceipts.observe({ ...bodyInput, agentId: 'parent' })).matched, false);
  assert.equal((await bodyReceipts.observe({ ...bodyInput, outcome: { status: 'completed' } })).matched, true);
  assert.equal((await bodyReceipts.observe({ ...bodyInput })).matched, false);
  const motor = require('../src/services/perception/embodied/motorOutcomeAdapter');
  let motorCalls = 0;
  const environment = { ownerAgentId: 'worker', actuatorId: 'search', toolName: 'genos_search_failures',
    execute: async () => { motorCalls += 1; return { status: 'completed', evidenceRefs: ['receipt:search'] }; } };
  const motorInput = { db: ctx.db, agentId: 'worker', environmentRef: 'env://worker', environment,
    intent: { intentId: 'search-1', action: 'search' } };
  assert.equal((await motor.execute(motorInput)).status, 'completed');
  const foreign = await motor.execute({ ...motorInput, agentId: 'parent' });
  assert.equal(foreign.reason, 'motor-actuator-owner-mismatch');
  const unleased = await motor.execute({ ...motorInput, environment: { ...environment, toolName: 'genos_fork' } });
  assert.equal(unleased.reason, 'motor-actuator-authority-denied');
  assert.equal(motorCalls, 1);
}

async function refusedCurrent(ctx, probe) {
  await probe.change();
  await assert.rejects(authority.assertRun(ctx.db, input(ctx)), { code: probe.code });
  await probe.restore();
  assert.equal((await authority.assertRun(ctx.db, input(ctx))).status, 'authorized');
}

async function boundMotorTool(ctx) {
  const dispatch = require('../src/services/mcpExecutor/dispatch');
  const modulePath = require.resolve('../src/services/mcpExecutor/bodyMotorBridge');
  const original = dispatch.executeConfiguredTransport;
  dispatch.executeConfiguredTransport = async () => ({ success: true, configured: true,
    status: 'completed', output: 'bounded-result' });
  delete require.cache[modulePath];
  try {
    const binding = await authority.assertTool(ctx.db, { agentId: ctx.agentId,
      toolName: 'genos_search_failures' });
    const result = await require(modulePath).runBoundMotorTool({ db: ctx.db, agentId: ctx.agentId,
      toolName: 'genos_search_failures', args: {}, circuitScope: ctx.agentId, binding });
    assert.equal(result.success, true);
    const row = await ctx.db.get(`SELECT agent_id, phase, effector_id FROM body_action_receipts
      WHERE agent_id = ? AND effector_id = 'backend_mcp_tool' ORDER BY rowid DESC LIMIT 1`, ctx.agentId);
    assert.deepEqual(row, { agent_id: ctx.agentId, phase: 'observed', effector_id: 'backend_mcp_tool' });
  } finally {
    dispatch.executeConfiguredTransport = original;
    delete require.cache[modulePath];
  }
}

async function filesystemObservation(ctx, workspace) {
  const sensor = require('../src/services/runtimeFilesystemReceipt');
  const pending = await sensor.begin({ db: ctx.db, agentId: ctx.agentId,
    runId: ctx.executionRun.id, workspaceRoot: workspace });
  await fs.writeFile(path.join(workspace, 'runtime-created.txt'), 'observed bytes');
  const writeProbe = require('./helpers/runtimeFileWriterProbe');
  const message = await writeProbe.writeAndReceive(workspace, 'solar');
  const localMessage = await writeProbe.writeAndReceive(workspace, 'local');
  const hash = require('node:crypto').createHash('sha256').update('direct bytes').digest('hex');
  assert.equal(message.hash, hash);
  assert.equal(sensor.recordDirectWrite(pending, { kind: 'genos.runtime.file-write/v1',
    path: '../outside.txt', hash }, 'solar_direct_write_actuator'), false);
  assert.equal(sensor.recordDirectWrite(pending, message, 'untrusted'), false);
  assert.equal(sensor.recordDirectWrite(pending, { ...message, hash: 'a'.repeat(64) },
    'solar_direct_write_actuator'), true);
  assert.equal(sensor.recordDirectWrite(pending, message, 'solar_direct_write_actuator'), true);
  assert.equal(sensor.recordDirectWrite(pending, localMessage, 'local_artifact_writer'), true);
  const outcome = await sensor.finish(pending);
  assert.equal(outcome.status, 'observed');
  assert.equal(outcome.causality, 'temporal_only');
  assert.equal(outcome.observationAttested, false);
  assert.deepEqual(outcome.changes, [{ path: 'direct-local.txt', kind: 'created' },
    { path: 'direct.txt', kind: 'created' },
    { path: 'runtime-created.txt', kind: 'created' }]);
  assert.deepEqual(outcome.directWrites.map(write => write.path), ['direct.txt', 'direct-local.txt']);
  assert.deepEqual(outcome.unattributedChanges, [{ path: 'runtime-created.txt', kind: 'created' }]);
  const row = await require('../src/services/bodyActionReceiptService').read(ctx.db, pending.actionId);
  assert.equal(row.phase, 'observed');
  assert.equal(row.agentId, ctx.agentId);
}

async function processAttribution(ctx) {
  await ctx.db.exec(`CREATE TABLE IF NOT EXISTS adaptive_state (
    scope TEXT NOT NULL, key TEXT NOT NULL, payload_json TEXT NOT NULL,
    version INTEGER NOT NULL, updated_at DATETIME, PRIMARY KEY (scope, key));
    CREATE TABLE IF NOT EXISTS adaptive_state_events (
      id INTEGER PRIMARY KEY, scope TEXT NOT NULL, key TEXT NOT NULL,
      event_type TEXT NOT NULL, event_payload TEXT NOT NULL, created_at DATETIME);`);
  const processReceipt = require('../src/services/runtimeProcessReceipt');
  const actionId = await processReceipt.predict({ db: ctx.db, agentId: ctx.agentId,
    runId: ctx.executionRun.id, executable: 'fixture-runtime' });
  const emitted = [];
  const input = { db: ctx.db, agentId: ctx.agentId, runId: ctx.executionRun.id,
    actionId, outcome: { status: 'completed', code: 0 },
    emit: (...args) => emitted.push(args) };
  assert.equal((await processReceipt.observe({ ...input, agentId: 'parent' })).matched, false);
  assert.equal((await processReceipt.observe(input)).matched, true);
  assert.equal((await processReceipt.observe(input)).matched, false);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][4].sourceActionId, actionId);
  const core = await require('../src/services/coreSelfService').loadCoreSelf(ctx.db, ctx.agentId);
  assert.equal(core.selfAttributionRate, 1);
}

async function attestedClaim(ctx) {
  const migration = require('../src/db/migrations/migrateEpistemicEvents');
  const revision = require('../src/services/epistemic/revisionSurface');
  await migration.migrateEpistemicEvents(ctx.db);
  revision.configureRevisionStore(ctx.db);
  try {
    await revision.persistClaim({ id: 'worker-claim', subject: 'body', origin: 'SelfObserved' },
      { agentId: ctx.agentId, runId: ctx.executionRun.id });
    const row = await ctx.db.get(`SELECT producer_agent_id, producer_run_id,
      producer_authority_hash FROM epistemic_claims WHERE id = 'worker-claim'`);
    assert.equal(row.producer_agent_id, ctx.agentId);
    assert.equal(row.producer_run_id, ctx.executionRun.id);
    assert.equal(row.producer_authority_hash,
      (await authority.read(ctx.db, ctx.executionRun.id)).hash);
    await assert.rejects(revision.persistClaim({ id: 'foreign-claim', subject: 'body' },
      { agentId: 'parent', runId: ctx.executionRun.id }),
    { code: 'EXECUTION_AUTHORITY_ACTOR_MISMATCH' });
  } finally { revision.configureRevisionStore(null); }
}

async function productionClaims(ctx) {
  const producer = require('../src/services/epistemic/runtimeClaimProducer');
  const event = { id: 'runtime-event-1', eventType: 'EVIDENCE_REPORT',
    payload: { executionRunId: ctx.executionRun.id,
      evidenceReport: { claims: [{ statement: 'A provisional runtime assertion', evidence: ['self report'] }] } } };
  const decision = { run: { id: ctx.executionRun.id } };
  assert.equal(await producer.record(ctx.db, { agentId: ctx.agentId, event, decision }), 1);
  assert.equal(await producer.record(ctx.db, { agentId: ctx.agentId, event, decision }), 1);
  const row = await ctx.db.get('SELECT * FROM epistemic_claims WHERE id = ?',
    producer.claimId(ctx.executionRun.id, event.id, 0));
  assert.equal(row.producer_agent_id, ctx.agentId);
  assert.equal(row.producer_run_id, ctx.executionRun.id);
  assert.equal(JSON.parse(row.claim_json).verification, 'self_reported');
  assert.equal(row.quality, 0);
  assert.equal(await producer.record(ctx.db, { agentId: ctx.agentId, event,
    decision: { ...decision, authorityRefusal: { code: 'denied' } } }), 0);
  await assert.rejects(producer.record(ctx.db, { agentId: 'parent', event, decision }),
    { code: 'EXECUTION_AUTHORITY_ACTOR_MISMATCH' });
}

async function directMcpProvenance(ctx) {
  const direct = require('../src/services/mcpExecutor/directBodyReceipt');
  await ctx.db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
    actor TEXT, agent_id TEXT, action TEXT, resource TEXT, decision TEXT,
    reason TEXT, payload_json TEXT)`);
  const receipt = await direct.begin({ db: ctx.db, toolName: 'genos_search_failures',
    actor: { agentId: ctx.agentId, runId: ctx.executionRun.id } });
  await direct.finish({ db: ctx.db, toolName: 'genos_search_failures', receipt,
    outcome: { status: 'completed' } });
  assert.equal((await require('../src/services/bodyActionReceiptService').read(ctx.db,
    receipt.actionId)).phase, 'observed');
  await direct.audit({ db: ctx.db, toolName: 'genos_search_failures', receipt: null,
    action: 'MCP_DIRECT_CALL', decision: 'allow' });
  const external = await ctx.db.get(`SELECT actor, agent_id, reason FROM audit_logs
    WHERE action = 'MCP_DIRECT_CALL' ORDER BY rowid DESC LIMIT 1`);
  assert.deepEqual(external, { actor: 'mcp-direct', agent_id: null,
    reason: 'external or unattributed call' });
}

async function liveChanges(ctx) {
  const db = ctx.db;
  const probes = [
    { change: () => db.run("UPDATE agents SET role='red_team' WHERE id='worker'"),
      restore: () => db.run("UPDATE agents SET role='procedural_executor' WHERE id='worker'"), code: 'EXECUTION_AUTHORITY_IDENTITY_CHANGED' },
    { change: () => db.run("UPDATE workspaces SET project_id='foreign' WHERE id='worker-workspace'"),
      restore: () => db.run("UPDATE workspaces SET project_id='project' WHERE id='worker-workspace'"), code: 'GVX_RUN_BINDING_SCOPE_CHANGED' },
    { change: () => db.run("UPDATE agents SET isolation_mode='Quarantine' WHERE id='parent'"),
      restore: () => db.run("UPDATE agents SET isolation_mode=NULL WHERE id='parent'"), code: 'EXECUTION_AUTHORITY_AGENT_REVOKED' },
    { change: () => db.run("UPDATE missions SET status='dormant' WHERE mission_id='worker-mission'"),
      restore: () => db.run("UPDATE missions SET status='active' WHERE mission_id='worker-mission'"), code: 'EXECUTION_AUTHORITY_MISSION_INACTIVE' },
    { change: () => db.run("DELETE FROM mission_agents WHERE agent_id='worker'"),
      restore: () => db.run("INSERT INTO mission_agents (mission_id,agent_id) VALUES ('worker-mission','worker')"), code: 'EXECUTION_AUTHORITY_MEMBERSHIP_REVOKED' },
    { change: () => db.run("INSERT INTO aeis_agent_dissonance VALUES ('parent',100)"),
      restore: () => db.run("DELETE FROM aeis_agent_dissonance WHERE agent_id='parent'"), code: 'AEIS_AUTHORITY_REVOKED' }
  ];
  for (const probe of probes) await refusedCurrent(ctx, probe);
}

async function revokeAndPublish(ctx) {
  await launchAuthority.rotate(ctx.db, { missionId: 'worker-mission', agentId: 'parent', forceRotate: true });
  await assert.rejects(authority.assertRun(ctx.db, input(ctx)), { code: 'MISSION_AUTHORITY_STALE' });
  const view = await authority.inspect(ctx.db, { ...input(ctx), scope: { organizationId: 'org', projectId: 'project' } });
  assert.deepEqual(view.current, { status: 'refused', code: 'MISSION_AUTHORITY_STALE' });
  const event = fixture.completion(ctx.executionRun.id, { usage: { tokens: 0, cost_usd: 0 } });
  const saved = await execution.recordExecutionEvent(ctx.db, ctx.agentId, event);
  assert.equal(saved.halt, true);
  assert.equal(saved.run.status, 'blocked');
  assert.equal(saved.biologicalReceipt.result.verified, false);
  assert.equal(saved.biologicalReceipt.result.reason, 'MISSION_AUTHORITY_STALE');
  assert.equal(saved.authorityRefusal.originalEventType, 'AGENT_COMPLETED');
  const monitor = require('../src/services/missionEnvelopeAuthorityMonitor');
  let halted = false;
  const consumer = { state: { missionDomainState: {} }, haltRuntime() { halted = true; } };
  assert.throws(() => monitor.assertEvent(consumer, saved), { code: 'MISSION_AUTHORITY_STALE' });
  assert.equal(halted, true);
  assert.equal(consumer.state.missionDomainState.domainVerdict, 'failed');
  const replay = await execution.recordExecutionEvent(ctx.db, ctx.agentId, event);
  assert.equal(replay.duplicate, true);
}

async function quietChild(ctx) {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  await once(child, 'spawn');
  let reason;
  const runtime = { ...ctx, child, state: { termination: null }, haltRuntime(self, kind, detail) {
    self.state.termination = { kind }; reason = detail; child.kill();
  } };
  const timer = require('../src/services/missionEnvelopeAuthorityMonitor').start(runtime);
  try {
    await launchAuthority.rotate(ctx.db, { missionId: 'worker-mission', agentId: 'parent', forceRotate: true });
    const timeout = setTimeout(() => child.kill(), 6000);
    await once(child, 'close');
    clearTimeout(timeout);
    assert.equal(reason, 'MISSION_AUTHORITY_STALE');
  } finally { clearInterval(timer); child.kill(); }
}

async function publicationRace(ctx, filename) {
  const other = openDatabase(filename);
  await other.exec('PRAGMA busy_timeout=5000');
  const original = ctx.db.run.bind(ctx.db);
  let entered;
  let release;
  const pending = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  ctx.db.run = async (sql, ...params) => {
    if (/UPDATE strategy_execution_runs/.test(sql)) { entered(); await barrier; }
    return original(sql, ...params);
  };
  try {
    const publication = execution.recordExecutionEvent(ctx.db, ctx.agentId,
      fixture.completion(ctx.executionRun.id, { usage: { tokens: 0, cost_usd: 0 } }));
    await pending;
    let rotated = false;
    const rotation = launchAuthority.rotate(other, { missionId: 'worker-mission', agentId: 'parent', forceRotate: true })
      .then(result => { rotated = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(rotated, false, 'another connection cannot revoke between the authority check and publication');
    release();
    assert.equal((await publication).run.status, 'completed');
    await rotation;
    await assert.rejects(authority.assertRun(ctx.db, input(ctx)), { code: 'MISSION_AUTHORITY_STALE' });
  } finally { release(); ctx.db.run = original; await other.close(); }
}

async function expiredAtBoundary(ctx) {
  const saved = await authority.read(ctx.db, ctx.executionRun.id);
  const realNow = Date.now;
  try {
    Date.now = () => Date.parse(saved.envelope.expiresAt);
    await assert.rejects(authority.assertRun(ctx.db, input(ctx)), { code: 'EXECUTION_AUTHORITY_EXPIRED' });
  } finally { Date.now = realNow; }
  assert.equal((await authority.assertRun(ctx.db, input(ctx))).status, 'authorized');
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-authority-'));
  const filename = path.join(root, 'authority.sqlite');
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  const db = openDatabase(filename);
  try {
    const contract = await seed(db);
    const first = await context(db, workspace, { contractRecord: contract });
    await immutableAndFresh(first, filename);
    await boundMotorTool(first);
    await processAttribution(first);
    await filesystemObservation(first, workspace);
    await attestedClaim(first);
    await productionClaims(first);
    await require('./helpers/rustMcpActorProbe').probe(first, filename, workspace);
    await directMcpProvenance(first);
    const secondContract = await fixture.addWorker(db, { agentId: 'worker-B' });
    const second = await context(db, workspace, { contractRecord: secondContract, agentId: 'worker-B' });
    const receipts = require('../src/services/bodyActionReceiptService');
    const secondAction = { db, agentId: 'worker-B', runId: second.executionRun.id,
      actionId: 'worker-B-action', effectorId: 'worker_dispatch' };
    await receipts.predict(secondAction);
    assert.equal((await receipts.observe({ ...secondAction, agentId: 'worker' })).matched, false);
    assert.equal((await receipts.observe({ ...secondAction, outcome: { status: 'created' } })).matched, true);
    assert.equal((await receipts.read(db, secondAction.actionId)).agentId, 'worker-B');
    await assert.rejects(receipts.predict({ ...secondAction, agentId: 'worker' }),
      { code: 'EXECUTION_AUTHORITY_ACTOR_MISMATCH' });
    await liveChanges(first);
    await revokeAndPublish(first);
    const quiet = await context(db, workspace, { contractRecord: contract });
    await quietChild(quiet);
    const race = await context(db, workspace, { contractRecord: contract });
    await publicationRace(race, filename);
    const expired = await context(db, workspace, { contractRecord: contract });
    await expiredAtBoundary(expired);
    assert.deepEqual(await authority.assertRun(db, { agentId: 'worker', runId: 'unknown' }), { status: 'legacy_unbound' });
    console.log('P1 authority: immutable scope, restart, tool/root ceilings, live revocation, refused publication and quiet child stop passed.');
  } finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
}

if (require.main === module) main().catch(failure => { console.error(failure); process.exitCode = 1; });
module.exports = { main };
