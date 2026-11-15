'use strict';

function ownsReplaySnapshotRule1(context) {
  return typeof context.snapshot.agent_id !== 'string' || !context.snapshot.agent_id.trim()
      || typeof context.snapshot.snapshot_id !== 'string' || !context.snapshot.snapshot_id.trim();
}

function ownsReplaySnapshotRule2(context) {
  return !context.owner || context.owner.execution_mode !== 'worker' || typeof context.owner.path !== 'string';
}

function ownsReplaySnapshotRule3(context) {
  return context.suppliedRoot !== null && (typeof context.suppliedRoot !== 'string' || context.path.resolve(context.suppliedRoot) !== context.root);
}

function enforcePersistedWorkerTool(context) {
  return typeof context.toolCall === 'string' ? { toolName: context.toolCall, args: {} } : (context.toolCall || {});
}

function assertWorkerToolAllowed(context) {
  return context.String(context.toolName).toLowerCase() === 'genos_topology_session'
    && (!context.contract.mission?.topologySessionId
      || (context.args.session_id || context.args.sessionId) !== context.contract.mission.topologySessionId);
}

module.exports = { ownsReplaySnapshotRule1, ownsReplaySnapshotRule2, ownsReplaySnapshotRule3, enforcePersistedWorkerTool, assertWorkerToolAllowed };
