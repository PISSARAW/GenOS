'use strict';

function importHistoryValue1(__genosValueScope1) {
  return __genosValueScope1.packageData?.schema !== 'genos.agentgit-history/v1' || !__genosValueScope1.agentId || !__genosValueScope1.refName ||
    !__genosValueScope1.Array.isArray(__genosValueScope1.history) || !__genosValueScope1.history.length || __genosValueScope1.history.length > 256 || __genosValueScope1.history.at(-1)?.object?.id !== __genosValueScope1.headObjectId;
}

function importHistoryValue2(__genosValueScope2) {
  return !__genosValueScope2.fastForward && !__genosValueScope2.leaseMatches && !__genosValueScope2.observedRewind;
}

function importEntryValue3(__genosValueScope3) {
  return __genosValueScope3.existing && (__genosValueScope3.existing.state_hash !== __genosValueScope3.object.state_hash || __genosValueScope3.existing.commit_hash !== __genosValueScope3.object.commit_hash);
}

function exportHistoryValue4(__genosValueScope4) {
  return !__genosValueScope4.row || __genosValueScope4.row.agent_id !== __genosValueScope4.agentId || __genosValueScope4.row.workspace_id !== __genosValueScope4.agent.workspace_id;
}

function importHistoryValue5(__genosValueScope5) {
  return __genosValueScope5.req.body?.force === true && __genosValueScope5.req.body?.expectedRemoteObjectId === (__genosValueScope5.prior?.object_id || null);
}

function importHistoryValue6(__genosValueScope6) {
  return { success: true, operation: 'remote-history-import', headObjectId: __genosValueScope6.headObjectId,
      trackingRef: __genosValueScope6.trackingRef, imported: __genosValueScope6.history.length, fastForward: __genosValueScope6.fastForward,
      forcedWithLease: !__genosValueScope6.fastForward && __genosValueScope6.leaseMatches, observedRewind: !__genosValueScope6.fastForward && __genosValueScope6.observedRewind };
}

module.exports = { importHistoryValue1, importHistoryValue2, importEntryValue3, exportHistoryValue4, importHistoryValue5, importHistoryValue6 };
