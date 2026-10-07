'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const attestation = require('../src/services/trinityRuntimeAttestation');
const manifest = require('../src/services/trinityRunManifest');
const traces = require('../src/services/trinityTraceEvents');
const values = require('../src/services/trinityProvenanceValues');

async function realChild(input) {
  const script = path.join(input.root, 'fixture.cjs');
  const source = "process.stdout.write(JSON.stringify({pid:process.pid,cwd:process.cwd()}));";
  await fs.writeFile(script, source);
  const observation = await attestation.captureLaunch({ normalizedMission: input.ctx.normalizedMission,
    workspaceRoot: input.root, resolvedExecutable: script,
    spawnSpec: { cmd: process.execPath, args: [script] } });
  assert.equal(observation.artifacts.find(item => item.path === script).sha256, values.hashBytes(source));
  assert.equal(observation.provider, null);
  assert.equal(observation.model, null);
  const child = spawn(process.execPath, [script], { cwd: input.root, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = await collect(child);
  const result = JSON.parse(output);
  assert.equal(result.pid, child.pid);
  assert.equal(result.cwd.toLowerCase(), input.root.toLowerCase());
  const first = await attestation.recordLaunch(input.ctx, { observation, pid: child.pid });
  const replay = await attestation.recordLaunch(input.ctx, { observation, pid: child.pid });
  assert.equal(replay.hash, first.hash);
  assert.equal(first.details.pid, child.pid);
  await assert.rejects(attestation.recordLaunch(input.ctx, { observation, pid: child.pid + 1 }),
    { code: 'TRINITY_TRACE_REPLAY_CHANGED' });
  await fs.writeFile(script, source + '\n// changed bytes');
  const changed = await attestation.captureLaunch({ normalizedMission: input.ctx.normalizedMission,
    workspaceRoot: input.root, resolvedExecutable: script,
    spawnSpec: { cmd: process.execPath, args: [script] } });
  assert.notEqual(changed.artifacts[1].sha256, observation.artifacts[1].sha256);
  await assert.rejects(attestation.recordLaunch(input.ctx, { observation: changed, pid: child.pid }),
    { code: 'TRINITY_TRACE_REPLAY_CHANGED' });
  return { observation, pid: child.pid };
}

function collect(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', bytes => { output += bytes; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output) : reject(new Error('Fixture failed: ' + code)));
  });
}

async function negativeCases(ctx, input) {
  await assert.rejects(attestation.recordLaunch(ctx, { ...input, pid: 0 }), { code: 'TRINITY_LAUNCH_PID_INVALID' });
  for (const field of ['model', 'provider', 'decisionAuthority', 'dependencies']) {
    await assert.rejects(attestation.recordLaunch(ctx, { ...input,
      observation: { ...input.observation, [field]: 'invented' } }), { code: 'TRINITY_LAUNCH_OBSERVATION_INVALID' });
  }
  await assert.rejects(attestation.recordLaunch(ctx, { ...input,
    observation: { ...input.observation, coverage: 1 } }), { code: 'TRINITY_LAUNCH_OBSERVATION_INVALID' });
  await assert.rejects(attestation.recordLaunch({ ...ctx, agentId: 'other-worker' }, input),
    { code: 'TRINITY_WORKER_SCOPE_INVALID' });
  await assert.rejects(attestation.recordLaunch({ ...ctx, normalizedMission: {
    ...ctx.normalizedMission, workspaceRoot: path.join(ctx.normalizedMission.workspaceRoot, 'other') } }, input),
    { code: 'TRINITY_WORKER_SCOPE_INVALID' });
  await assert.rejects(attestation.captureLaunch({ normalizedMission: ctx.normalizedMission,
    workspaceRoot: ctx.normalizedMission.workspaceRoot, resolvedExecutable: 'unresolved-runtime',
    spawnSpec: { cmd: process.execPath, args: [] } }), { code: 'TRINITY_LAUNCH_EXECUTABLE_UNRESOLVED' });
  const missing = { ...ctx, executionRun: { id: 'missing' } };
  await assert.rejects(attestation.recordLaunch(missing, input), { code: 'TRINITY_RUNTIME_MANIFEST_MISSING' });
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trinity-l2-runtime-'));
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const ctx = { db, agentId: 'worker', executionRun: { id: 'run' }, normalizedMission: {
      missionScope: { missionId: 'mission', trinityExperimentId: 'experiment' },
      workspaceRoot: root, orchestratorAgentId: 'parent' }, dispatchedAgent: { organization_id: 'tenant' } };
    await manifest.persist(db, manifest.build({ correlation: { missionId: 'mission', runId: 'run',
      experimentId: 'experiment', worldId: 'world', workerId: 'worker', parentId: 'parent',
      tenantId: 'tenant', workspaceRoot: root }, requestedRuntime: { model: 'requested-only' } }));
    const input = await realChild({ root, ctx });
    await negativeCases(ctx, input);
    const events = await traces.read(db, { missionId: 'mission' });
    assert.equal(events.length, 1);
    assert.equal(events[0].stage, 'runtime_launcher');
    assert.equal((await manifest.read(db, { missionId: 'mission', runId: 'run' })).payload.observedRuntime.status, 'unknown');
    assert.equal(await attestation.captureLaunch({ normalizedMission: {} }), null);
    assert.equal(await attestation.recordLaunch({ normalizedMission: {} }, {}), null);
    console.log('Trinity L2 actual launcher, immutable observation, requested/observed separation: PASS');
  } finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
