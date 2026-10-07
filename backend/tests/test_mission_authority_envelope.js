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
  const { contractRecord, duration = 60000 } = options;
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord,
    missionId: 'worker-mission', budget: { tokens: 0, deterministic: true, latencyMs: duration } });
  const ctx = { db, agentId: 'worker', executionRun: run, autonomyPlan: {}, normalizedMission: {
    agentId: 'worker', missionId: 'worker-mission', workspaceRoot: root, toolLease: ['genos_search_failures'], timeoutMs: duration } };
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
}

async function refusedCurrent(ctx, probe) {
  await probe.change();
  await assert.rejects(authority.assertRun(ctx.db, input(ctx)), { code: probe.code });
  await probe.restore();
  assert.equal((await authority.assertRun(ctx.db, input(ctx))).status, 'authorized');
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
    await liveChanges(first);
    await revokeAndPublish(first);
    const quiet = await context(db, workspace, { contractRecord: contract });
    await quietChild(quiet);
    const race = await context(db, workspace, { contractRecord: contract });
    await publicationRace(race, filename);
    const expired = await context(db, workspace, { contractRecord: contract, duration: 30 });
    await new Promise(resolve => setTimeout(resolve, 50));
    await assert.rejects(authority.assertRun(db, input(expired)), { code: 'EXECUTION_AUTHORITY_EXPIRED' });
    assert.deepEqual(await authority.assertRun(db, { agentId: 'worker', runId: 'unknown' }), { status: 'legacy_unbound' });
    console.log('P1 authority: immutable scope, restart, tool/root ceilings, live revocation, refused publication and quiet child stop passed.');
  } finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
}

if (require.main === module) main().catch(failure => { console.error(failure); process.exitCode = 1; });
module.exports = { main };
