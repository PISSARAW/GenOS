"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const telemetry = require('../src/services/telemetryObserver');
const engine = require('../src/services/poetExecutionEngine');
function complete(mission, eventType) {
  setImmediate(() => telemetry.emit('telemetry', { agentId: mission.agentId, eventType }));
}
async function attempt(environment, startMission, timeoutMs = 10000) {
  runtime.startMission = startMission;
  return engine.executeAgentOnEnvironment({ id: 'poet-evidence-test' }, environment, { timeoutMs });
}
async function testSelection(db, root) {
  const calls = [];
  const environments = [];
  for (const kind of ['training', 'heldout']) {
    const workspace = path.join(root, kind);
    await fs.mkdir(workspace);
    await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ scripts: { test: 'node verify.cjs' } }));
    await fs.writeFile(path.join(workspace, 'verify.cjs'), `require('node:assert/strict').equal(require('./solution.json').answer,${kind === 'training' ? 1 : 2});`);
    environments.push({ id: kind, workspacePath: workspace, workspaceId: 'evidence-workspace', db,
      difficulty: 0.2, goals: [kind], verifierCommand: 'npm test',
      protectedPaths: ['package.json', 'verify.cjs'],
      stats: { attemptCount: 0, solvedCount: 0 } });
  }
  runtime.startMission = async (mission) => {
    const heldOut = mission.prompt.includes('heldout');
    calls.push({ agent: mission.agentId, heldOut });
    const answer = mission.agentId === 'overfit' ? 1 : (heldOut ? 2 : 0);
    await fs.writeFile(path.join(mission.workspaceRoot, 'solution.json'), JSON.stringify({ answer }));
    complete(mission, 'AGENT_COMPLETED');
    return {};
  };
  const result = await require('../src/services/poetBridgeService').evaluateGeneralization(
    [{ id: 'overfit' }, { id: 'heldout-specialist' }],
    { training: [environments[0]], heldOut: [environments[1]] }, { timeoutMs: 5000 });
  assert.equal(result.selectedAgentId, 'overfit');
  assert.equal(result.training.successRate, 1);
  assert.equal(result.heldOut.successRate, 0);
  assert.deepEqual(calls.filter((call) => call.heldOut).map((call) => call.agent), ['overfit']);
}
async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-poet-evidence-'));
  process.env.GENOS_ADMIN_PASSWORD = 'poet-test-admin';
  const db = await getDatabase(path.join(root, 'proof.db'));
  const original = { start: runtime.startMission, stop: runtime.stopMission };
  let stopped = 0;
  runtime.stopMission = async () => { stopped += 1; };
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await db.run('INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)', 'evidence-workspace', 'Evidence test', workspace);
  await fs.writeFile(path.join(workspace, 'solution.json'), '{"answer":1}');
  await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ scripts: { test: 'node verify.cjs' } }));
  await fs.writeFile(path.join(workspace, 'verify.cjs'), 'process.exit(0)');
  const environment = { id: 'evidence', workspaceId: 'evidence-workspace', workspacePath: workspace, db,
    difficulty: 0.2, goals: ['write a solution'], verifierCommand: 'npm test',
    protectedPaths: ['package.json', 'verify.cjs'],
    stats: { attemptCount: 0, solvedCount: 0 } };
  try {
    const snapshots = require('../src/services/workspaceSnapshotStore');
    const originalMaterialize = snapshots.materialize;
    let partialPath;
    snapshots.materialize = async (_snapshot, destination) => {
      partialPath = destination;
      await fs.mkdir(destination, { recursive: true });
      await fs.writeFile(path.join(destination, 'partial.txt'), 'partial');
      throw new Error('fixture materialization failed');
    };
    try {
      await assert.rejects(require('../src/services/poetExecutionEvidence').isolateEnvironment(environment),
        /fixture materialization failed/);
      await assert.rejects(fs.access(partialPath), /ENOENT/);
    } finally {
      snapshots.materialize = originalMaterialize;
    }
    const unchanged = await attempt(environment, async (mission) => { complete(mission, 'AGENT_COMPLETED'); return {}; });
    assert.match(unchanged.error, /new or changed/);
    const failed = await attempt(environment, async (mission) => { complete(mission, 'AGENT_FAILED'); return {}; });
    assert.equal(failed.success, false);
    assert.equal(failed.verification, undefined);
    const hung = await attempt(environment,
      (mission) => { complete(mission, 'AGENT_COMPLETED'); return new Promise(() => {}); }, 500);
    assert.match(hung.error, /deadline/);
    assert.ok(stopped > 0, 'deadline stops the runtime even after premature completion telemetry');
    const rewritten = await attempt(environment, async (mission) => {
      await fs.writeFile(path.join(mission.workspaceRoot, 'solution.json'), '{"answer":2}');
      await fs.writeFile(path.join(mission.workspaceRoot, 'verify.cjs'), 'process.exit(1)');
      complete(mission, 'AGENT_COMPLETED');
      return {};
    });
    assert.match(rewritten.error, /verifier contract changed/);
    assert.equal(await fs.readFile(path.join(workspace, 'solution.json'), 'utf8'), '{"answer":1}', 'attempts never mutate the template');
    const bridge = require('../src/services/poetBridgeService');
    await assert.rejects(bridge.evaluateGeneralization([{ id: 'solver' }],
      { training: [{ ...environment, protectedPaths: [] }],
        heldOut: [{ ...environment, id: 'invalid-heldout' }] }), /requires a workspace/);
    await assert.rejects(bridge.evaluateGeneralization([{ id: 'solver' }],
      { training: [environment], heldOut: [{ ...environment, id: 'copied' }] }), /content must be disjoint/);
    await assert.rejects(bridge.evaluateGeneralization([{ id: 'solver' }],
      { training: [environment], heldOut: [{ ...environment, id: 'renamed', goals: ['different wording'] }] }), /content must be disjoint/);
    const unsafe = { ...environment, artifactPath: '../outside.json' };
    await assert.rejects(require('../src/services/poetExecutionEvidence').artifactEvidence(unsafe), /inside/);
    await testSelection(db, root);
    console.log('POET evidence: partial materialization cleanup, unchanged artifact, failed terminal, hung startup, verifier tamper, split leakage, path escape rejected; agent selection frozen: PASS');
  } finally {
    runtime.startMission = original.start;
    runtime.stopMission = original.stop;
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
