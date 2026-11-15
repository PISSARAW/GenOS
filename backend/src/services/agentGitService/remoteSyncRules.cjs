'use strict';

function importHistoryRule1(context) {
  return context.packageData?.schema !== 'genos.agentgit-history/v1' || !context.agentId || !context.refName ||
    !context.Array.isArray(context.history) || !context.history.length || context.history.length > 256 || context.history.at(-1)?.object?.id !== context.headObjectId;
}

function importHistoryRule2(context) {
  return !context.fastForward && !context.leaseMatches && !context.observedRewind;
}

function importEntry(context) {
  return context.existing && (context.existing.state_hash !== context.object.state_hash || context.existing.commit_hash !== context.object.commit_hash);
}

function exportHistory(context) {
  return !context.row || context.row.agent_id !== context.agentId || context.row.workspace_id !== context.agent.workspace_id;
}

function importHistoryRule5(context) {
  return context.req.body?.force === true && context.req.body?.expectedRemoteObjectId === (context.prior?.object_id || null);
}

function importHistoryRule6(context) {
  return { success: true, operation: 'remote-history-import', headObjectId: context.headObjectId,
      trackingRef: context.trackingRef, imported: context.history.length, fastForward: context.fastForward,
      forcedWithLease: !context.fastForward && context.leaseMatches, observedRewind: !context.fastForward && context.observedRewind };
}

module.exports = { importHistoryRule1, importHistoryRule2, importEntry, exportHistory, importHistoryRule5, importHistoryRule6 };
