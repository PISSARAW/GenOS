'use strict';

async function ownsReplaySnapshotStage1(__genosStageScope1) {
for (const entry of __genosStageScope1.entries) {
    if (!entry.isFile() || !/^[A-Za-z0-9_-]{1,128}\.json$/.test(entry.name)) continue;
    let snapshotPath;
    try { snapshotPath = (0, __genosStageScope1.resolveContainedPathNoSymlinkSync)(__genosStageScope1.root,
      __genosStageScope1.path.posix.join('.genos', 'evidence-snapshots', entry.name), 'worker replay snapshot'); }
    catch (_) { continue; }
    let snapshot;
    try { snapshot = __genosStageScope1.JSON.parse(await __genosStageScope1.fs.readFile(snapshotPath, 'utf8')); } catch (_) { continue; }
    if ((0, __genosStageScope1.require)('./workerContractEnforcementValues1.js').ownsReplaySnapshotValue1({ get snapshot() { return snapshot; } })) continue;
    if (__genosStageScope1.reference === snapshot.snapshot_id || __genosStageScope1.path.resolve(__genosStageScope1.reference) === snapshotPath) return { value: ( true) };
  }
}

async function enforcePersistedWorkerToolStage2(__genosStageScope2) {
if ((0, __genosStageScope2.String)(__genosStageScope2.toolName || '').trim().toLowerCase() === 'genos_replay'
    && !(await (0, __genosStageScope2.ownsReplaySnapshot)({ db: __genosStageScope2.db, agentId: __genosStageScope2.agentId, reference: __genosStageScope2.args.snapshot || __genosStageScope2.args.snapshot_id }))) {
    throw __genosStageScope2.Object.assign(new __genosStageScope2.Error('Workers may replay only their own evidence capsule.'), {
      code: 'WORKER_REPLAY_SNAPSHOT_SCOPE_DENIED'
    });
  }
}

module.exports = { ownsReplaySnapshotStage1, enforcePersistedWorkerToolStage2 };
