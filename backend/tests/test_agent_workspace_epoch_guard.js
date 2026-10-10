const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  cleanupWorkspace, scheduleWorkspaceCleanup, trackWorkspace, reconcileWorkspaceCleanup
} = require('../src/services/agentWorkspaceLifecycleService');

async function run() {
  const capsuleRoot = fs.mkdtempSync(path.join(__dirname, '.genos-epoch-'));
  const previousCapsuleRoot = process.env.GENOS_CAPSULE_ROOT;
  process.env.GENOS_CAPSULE_ROOT = capsuleRoot;
  process.env.GENOS_ADMIN_PASSWORD ||= 'test-only-agent-epoch-password';
  try {
    const db = await require('../src/db').getDatabase(path.join(capsuleRoot, 'test.db'));
    for (const id of ['orchestrator_idx', 'swarm_worker', 'broken_worktree']) {
      await db.run('INSERT INTO agents (id, name, role, status) VALUES (?, ?, ?, ?)', id, id, 'worker', 'completed');
    }
    // Direct cleanup: a stale epoch must never delete a successor's capsule.
    const reused = path.join(capsuleRoot, 'orchestrator_idx');
    const reusedMarker = path.join(reused, '.genos-epoch');
    fs.mkdirSync(reused, { recursive: true });
    fs.writeFileSync(path.join(reused, 'capsule.txt'), 'successor capsule');
    fs.writeFileSync(reusedMarker, 'epoch-successor');

    const stale = await cleanupWorkspace(reused, 'orchestrator_idx', { expectedEpoch: 'epoch-original' });
    assert.strictEqual(stale, 'epoch-mismatch', 'a changed marker must report an epoch mismatch');
    assert.strictEqual(fs.existsSync(reused), true, 'a reused path must survive a stale cleanup');
    assert.strictEqual(fs.readFileSync(reusedMarker, 'utf8'), 'epoch-successor');
    assert.strictEqual(fs.readFileSync(path.join(reused, 'capsule.txt'), 'utf8'), 'successor capsule');

    const current = await cleanupWorkspace(reused, 'orchestrator_idx', { expectedEpoch: 'epoch-successor' });
    assert.strictEqual(current, 'removed');
    assert.strictEqual(fs.existsSync(reused), false, 'a matching epoch still reclaims the capsule');

    // Scheduled cleanup: the epoch captured at scheduling time guards the rm.
    const scheduled = path.join(capsuleRoot, 'swarm_worker');
    fs.mkdirSync(scheduled, { recursive: true });
    fs.writeFileSync(path.join(scheduled, 'keep.txt'), 'live successor payload');
    await trackWorkspace('swarm_worker', scheduled);
    const scheduledMarker = path.join(scheduled, '.genos-epoch');
    const capturedEpoch = fs.readFileSync(scheduledMarker, 'utf8');
    assert.ok(capturedEpoch, 'tracking must write an epoch marker');
    fs.writeFileSync(scheduledMarker, 'epoch-from-successor');

    await scheduleWorkspaceCleanup('swarm_worker', 0);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(fs.existsSync(scheduled), true, 'scheduled cleanup must skip a reused path');
    assert.strictEqual(fs.readFileSync(path.join(scheduled, 'keep.txt'), 'utf8'), 'live successor payload');

    // A failed worktree removal must not fall through to an unconditional rm.
    const brokenWorktree = path.join(capsuleRoot, 'broken_worktree');
    fs.mkdirSync(brokenWorktree, { recursive: true });
    fs.writeFileSync(path.join(brokenWorktree, '.git'), 'gitdir: /nonexistent');
    fs.writeFileSync(path.join(brokenWorktree, '.genos-epoch'), 'epoch-broken');
    fs.writeFileSync(path.join(brokenWorktree, 'data.txt'), 'do not delete');
    const failed = await cleanupWorkspace(brokenWorktree, 'broken_worktree');
    assert.strictEqual(failed, 'worktree-remove-failed');
    assert.strictEqual(fs.existsSync(path.join(brokenWorktree, 'data.txt')), true, 'failed worktree removal must preserve the capsule');

    const live = path.join(capsuleRoot, 'live_worker');
    fs.mkdirSync(live, { recursive: true });
    fs.writeFileSync(path.join(live, 'keep.txt'), 'active worker data');
    await db.run('INSERT INTO agents (id, name, role, status, runtime_pid) VALUES (?, ?, ?, ?, ?)',
      'live_worker', 'live_worker', 'worker', 'running', process.pid);
    await trackWorkspace('live_worker', live);
    const liveEpoch = fs.readFileSync(path.join(live, '.genos-epoch'), 'utf8');
    assert.strictEqual(await cleanupWorkspace(live, 'live_worker', { expectedEpoch: liveEpoch }),
      'agent-not-terminal', 'direct cleanup cannot remove a running worker');
    assert.strictEqual(await reconcileWorkspaceCleanup(db), 0, 'reconciliation cannot schedule a live worker');
    assert.strictEqual(fs.existsSync(live), true);
    await db.run("UPDATE agents SET status = 'completed' WHERE id = 'live_worker'");
    assert.strictEqual(await cleanupWorkspace(live, 'live_worker', { expectedEpoch: liveEpoch }),
      'runtime-alive', 'a terminal row cannot overrule a live PID');
    await db.run("UPDATE agents SET runtime_pid = NULL WHERE id = 'live_worker'");
    const { activeProcesses } = require('../src/services/agentOrchestrationState');
    activeProcesses.set('live_worker', { pid: process.pid });
    assert.strictEqual(await scheduleWorkspaceCleanup('live_worker', 0), false, 'an active child blocks capture');
    activeProcesses.delete('live_worker');
    assert.strictEqual(await scheduleWorkspaceCleanup('live_worker', 0), true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(fs.existsSync(live), false, 'a terminal stopped worker can be reclaimed');

    const successor = path.join(capsuleRoot, 'stale_worker');
    fs.mkdirSync(successor, { recursive: true });
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('stale_worker', 'stale_worker', 'worker', 'completed')");
    await trackWorkspace('stale_worker', successor);
    fs.writeFileSync(path.join(successor, '.genos-epoch'), 'new-owner-epoch');
    assert.strictEqual(await reconcileWorkspaceCleanup(db), 0, 'reconciliation cannot adopt a successor epoch');
    assert.strictEqual(await cleanupWorkspace(successor, 'stale_worker'), 'epoch-mismatch',
      'direct cleanup must use the persisted epoch, not the successor marker');
    assert.strictEqual(fs.existsSync(successor), true);

    const repo = path.join(capsuleRoot, 'git-source');
    const worktreeRoot = path.join(capsuleRoot, 'race_worker');
    execFileSync('git', ['init', repo]);
    execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      'commit', '--allow-empty', '-m', 'initial']);
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', worktreeRoot]);
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('race_worker', 'race_worker', 'worker', 'completed')");
    await trackWorkspace('race_worker', worktreeRoot);
    const { withGitRepoLock } = require('../src/services/agentWorkspaceLifecycle/git');
    let pendingRemoval;
    await withGitRepoLock(repo, async () => {
      pendingRemoval = cleanupWorkspace(worktreeRoot, 'race_worker');
      await new Promise((resolve) => setTimeout(resolve, 300));
      fs.writeFileSync(path.join(worktreeRoot, '.genos-epoch'), 'successor-during-git-lock');
    });
    assert.strictEqual(await pendingRemoval, 'epoch-mismatch',
      'worktree removal must recheck epoch after acquiring the Git lock');
    assert.strictEqual(fs.existsSync(worktreeRoot), true);

    const rollback = path.join(capsuleRoot, 'recovery_attempt_1');
    fs.mkdirSync(rollback, { recursive: true });
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('recovery_target', 'recovery_target', 'worker', 'running')");
    await trackWorkspace('recovery_attempt_1', rollback);
    const rollbackOptions = { rollbackUnlaunched: 'recovery_target' };
    const { activeProcesses: processes } = require('../src/services/agentOrchestrationState');
    processes.set('recovery_target', { pid: process.pid });
    assert.strictEqual(await cleanupWorkspace(rollback, 'recovery_attempt_1', rollbackOptions),
      'runtime-alive', 'rollback cannot delete a launched worker capsule');
    processes.delete('recovery_target');
    assert.strictEqual(await cleanupWorkspace(rollback, 'recovery_attempt_1', rollbackOptions),
      'removed', 'an unlaunched reserved recovery capsule can be rolled back');

    const resumed = path.join(capsuleRoot, 'resumed_worker');
    fs.mkdirSync(resumed, { recursive: true });
    await db.run("INSERT INTO agents (id, name, role, status) VALUES ('resumed_worker', 'resumed_worker', 'worker', 'completed')");
    await trackWorkspace('resumed_worker', resumed);
    assert.strictEqual(await scheduleWorkspaceCleanup('resumed_worker', 40), true);
    processes.set('resumed_worker', { pid: process.pid });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.strictEqual(fs.existsSync(resumed), true, 'a worker reactivated after scheduling survives the reclaimer');
    processes.delete('resumed_worker');
  } finally {
    await require('../src/db').closeDatabase();
    fs.rmSync(capsuleRoot, { recursive: true, force: true });
    if (previousCapsuleRoot === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsuleRoot;
  }
  console.log('Agent workspace epoch-guard checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
