'use strict';

async function findOwnedReplaySnapshot(context) {
for (const entry of context.entries) {
    if (!entry.isFile() || !/^[A-Za-z0-9_-]{1,128}\.json$/.test(entry.name)) continue;
    let snapshotPath;
    try { snapshotPath = context.resolveContainedPathNoSymlinkSync(context.root,
      context.path.posix.join('.genos', 'evidence-snapshots', entry.name), 'worker replay snapshot'); }
    catch (_) { continue; }
    let snapshot;
    try { snapshot = context.JSON.parse(await context.fs.readFile(snapshotPath, 'utf8')); } catch (_) { continue; }
    if (context.require('./workerContractEnforcementRules.js').ownsReplaySnapshotRule1({ get snapshot() { return snapshot; } })) continue;
    if (context.reference === snapshot.snapshot_id || context.path.resolve(context.reference) === snapshotPath) return { value: ( true) };
  }
}

async function enforceReplaySnapshotOwnership(context) {
if (context.String(context.toolName || '').trim().toLowerCase() === 'genos_replay'
    && !(await context.ownsReplaySnapshot({ db: context.db, agentId: context.agentId, reference: context.args.snapshot || context.args.snapshot_id }))) {
    throw context.Object.assign(new context.Error('Workers may replay only their own evidence capsule.'), {
      code: 'WORKER_REPLAY_SNAPSHOT_SCOPE_DENIED'
    });
  }
}

module.exports = { findOwnedReplaySnapshot, enforceReplaySnapshotOwnership };
