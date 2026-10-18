'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'versioned-causal-state-test-only';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const fixture = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const authority = require('../src/services/missionEnvelopeAuthority');
const launchAuthority = require('../src/services/missionExecutionAuthority');
const causal = require('../src/services/versionedCausalStateService');

async function prepare(db) {
  await fixture.workerSchema(db);
  await db.exec(`ALTER TABLE agents ADD COLUMN status TEXT;
    ALTER TABLE agents ADD COLUMN isolation_mode TEXT;
    ALTER TABLE mission_agents ADD COLUMN role TEXT;
    CREATE TABLE aeis_agent_dissonance (agent_id TEXT PRIMARY KEY, authority_level INTEGER);`);
  const worker = await fixture.addWorker(db);
  await launchAuthority.rotate(db, { missionId: 'worker-mission', agentId: 'parent', forceRotate: true });
  return worker;
}

async function authorizedRun(db, contractRecord, workspace) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord,
    missionId: 'worker-mission', budget: { tokens: 100, deterministic: true, latencyMs: 300000 } });
  const normalizedMission = { agentId: 'worker', missionId: 'worker-mission',
    workspaceRoot: workspace, workspaceId: 'worker-workspace', toolLease: ['genos_snapshot'],
    timeoutMs: 300000, evidencePolicy: { independentVerifier: true } };
  await authority.seal({ db, agentId: 'worker', executionRun: run,
    executable: process.execPath, contractRecord, autonomyPlan: { mode: 'test' }, normalizedMission });
  return run;
}

async function buildHistory(db, run) {
  const root = await causal.createRoot(db, { runId: run.id, agentId: 'worker',
    branchId: 'main', snapshotId: 'state-root', purpose: 'baseline',
    state: { counter: 0, nested: { mode: 'base' }, obsolete: true } });
  assert.equal(root.snapshot.promotionEligible, false);
  assert.match(root.snapshot.seal, /^[a-f0-9]{64}$/);

  const main = await causal.append(db, { runId: run.id, agentId: 'worker', branchId: 'main',
    expectedHeadId: 'state-root', snapshotId: 'state-main-1', event: { kind: 'increment' },
    state: { nested: { mode: 'main' }, counter: 1, added: ['a', 'b'] } });
  assert.equal(main.snapshot.parentSnapshotId, 'state-root');
  assert.equal(main.snapshot.sequence, 1);
  assert.ok(main.operations.some((entry) => entry.op === 'remove' && entry.path === '/obsolete'));

  const fork = await causal.fork(db, { runId: run.id, agentId: 'worker',
    sourceSnapshotId: 'state-root', branchId: 'counterfactual', snapshotId: 'state-fork-0',
    purpose: 'test alternative', intervention: { variable: 'counter', value: 2 } });
  assert.equal(fork.snapshot.stateHash, root.snapshot.stateHash);
  assert.equal(fork.promotionEligible, false);

  const alternative = await causal.append(db, { runId: run.id, agentId: 'worker',
    branchId: 'counterfactual', expectedHeadId: 'state-fork-0', snapshotId: 'state-fork-1',
    event: { kind: 'intervention', variable: 'counter' },
    state: { counter: 2, nested: { mode: 'alternative' }, obsolete: true } });
  return { root, main, fork, alternative };
}

async function assertDiffAndReplay(db, run, history) {
  const compared = await causal.diff(db, { runId: run.id, agentId: 'worker',
    leftSnapshotId: history.main.snapshot.id, rightSnapshotId: history.alternative.snapshot.id });
  assert.equal(compared.promotionEligible, false);
  assert.match(compared.diffHash, /^[a-f0-9]{64}$/);
  assert.ok(compared.operations.length > 0);

  const replayedMain = await causal.replay(db, { runId: run.id, agentId: 'worker',
    fromSnapshotId: 'state-root', toSnapshotId: 'state-main-1' });
  assert.equal(replayedMain.status, 'verified');
  assert.equal(replayedMain.promotionEligible, false);
  assert.deepEqual(replayedMain.path, ['state-root', 'state-main-1']);

  const replayedFork = await causal.replay(db, { runId: run.id, agentId: 'worker',
    fromSnapshotId: 'state-root', toSnapshotId: 'state-fork-1' });
  assert.deepEqual(replayedFork.path, ['state-root', 'state-fork-0', 'state-fork-1']);
  assert.equal(replayedFork.observedHash, history.alternative.snapshot.stateHash);

  await assert.rejects(causal.replay(db, { runId: run.id, agentId: 'worker',
    fromSnapshotId: 'state-root', toSnapshotId: 'state-main-1', expectedHash: '0'.repeat(64) }),
  (error) => error.code === 'CAUSAL_STATE_REPLAY_EXPECTATION_FAILED'
    && error.receipt?.status === 'refused');
  const refused = await db.get("SELECT status, reason FROM causal_state_replay_receipts WHERE status = 'refused'");
  assert.deepEqual(refused, { status: 'refused', reason: 'CAUSAL_STATE_REPLAY_EXPECTATION_FAILED' });
}

async function assertFailClosed(db, run, contractRecord) {
  await assert.rejects(causal.append(db, { runId: run.id, agentId: 'worker', branchId: 'main',
    expectedHeadId: 'state-root', state: { counter: 9 } }),
  { code: 'CAUSAL_STATE_BRANCH_HEAD_CHANGED' });
  await assert.rejects(db.run("UPDATE causal_state_snapshots SET state_hash = 'tampered' WHERE id = 'state-root'"),
    /causal state snapshots are immutable/);
  await assert.rejects(db.run("UPDATE causal_state_branches SET purpose = 'forged' WHERE id = 'main'"),
    /causal branch identity is immutable/);
  const internal = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord,
    budget: { tokens: 10, latencyMs: 300000 } });
  await assert.rejects(causal.createRoot(db, { runId: internal.id, agentId: 'worker',
    state: { forbidden: true } }), { code: 'EXECUTION_AUTHORITY_BINDING_MISSING' });
  await assert.rejects(causal.diff(db, { runId: run.id, agentId: 'parent',
    leftSnapshotId: 'state-root', rightSnapshotId: 'state-main-1' }),
  { code: 'EXECUTION_AUTHORITY_ACTOR_MISMATCH' });
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-causal-state-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'input.txt'), 'canonical input');
  const db = openDatabase(path.join(root, 'causal-state.sqlite'));
  try {
    const contractRecord = await prepare(db);
    const run = await authorizedRun(db, contractRecord, workspace);
    const history = await buildHistory(db, run);
    await assertDiffAndReplay(db, run, history);
    await assertFailClosed(db, run, contractRecord);
    console.log('Versioned causal state: immutable snapshots, forks, diffs and verified replay passed.');
  } finally {
    await db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { main };
