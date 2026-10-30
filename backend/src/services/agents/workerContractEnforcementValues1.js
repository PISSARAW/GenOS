'use strict';

function ownsReplaySnapshotValue1(__genosValueScope1) {
  return typeof __genosValueScope1.snapshot.agent_id !== 'string' || !__genosValueScope1.snapshot.agent_id.trim()
      || typeof __genosValueScope1.snapshot.snapshot_id !== 'string' || !__genosValueScope1.snapshot.snapshot_id.trim();
}

function ownsReplaySnapshotValue2(__genosValueScope2) {
  return !__genosValueScope2.owner || __genosValueScope2.owner.execution_mode !== 'worker' || typeof __genosValueScope2.owner.path !== 'string';
}

function ownsReplaySnapshotValue3(__genosValueScope3) {
  return __genosValueScope3.suppliedRoot !== null && (typeof __genosValueScope3.suppliedRoot !== 'string' || __genosValueScope3.path.resolve(__genosValueScope3.suppliedRoot) !== __genosValueScope3.root);
}

function enforcePersistedWorkerToolValue4(__genosValueScope4) {
  return typeof __genosValueScope4.toolCall === 'string' ? { toolName: __genosValueScope4.toolCall, args: {} } : (__genosValueScope4.toolCall || {});
}

function assertWorkerToolAllowedValue5(__genosValueScope5) {
  return (0, __genosValueScope5.String)(__genosValueScope5.toolName).toLowerCase() === 'genos_topology_session'
    && (!__genosValueScope5.contract.mission?.topologySessionId
      || (__genosValueScope5.args.session_id || __genosValueScope5.args.sessionId) !== __genosValueScope5.contract.mission.topologySessionId);
}

module.exports = { ownsReplaySnapshotValue1, ownsReplaySnapshotValue2, ownsReplaySnapshotValue3, enforcePersistedWorkerToolValue4, assertWorkerToolAllowedValue5 };
