const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  cleanupWorkspace, scheduleWorkspaceCleanup, trackWorkspace
} = require('../src/services/agentWorkspaceLifecycleService');

async function run() {
  const capsuleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-epoch-'));
  const previousCapsuleRoot = process.env.GENOS_CAPSULE_ROOT;
  process.env.GENOS_CAPSULE_ROOT = capsuleRoot;
  try {
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
    fs.writeFileSync(path.join(brokenWorktree, 'data.txt'), 'do not delete');
    const failed = await cleanupWorkspace(brokenWorktree, 'broken_worktree');
    assert.strictEqual(failed, 'worktree-remove-failed');
    assert.strictEqual(fs.existsSync(path.join(brokenWorktree, 'data.txt')), true, 'failed worktree removal must preserve the capsule');
  } finally {
    fs.rmSync(capsuleRoot, { recursive: true, force: true });
    if (previousCapsuleRoot === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsuleRoot;
  }
  console.log('Agent workspace epoch-guard checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
