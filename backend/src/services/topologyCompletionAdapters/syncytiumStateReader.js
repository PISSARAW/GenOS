'use strict';

async function read(input = {}) {
  const { db, missionId, context } = input;
  const sessionId = context?.sessionId
    || context?.topologySession?.sessionId
    || null;
  if (!sessionId) {
    return { status: 'incomplete', reason: 'syncytium_session_missing' };
  }
  try {
    const syncytium = require('../syncytiumCoordinationService');
    const state = await syncytium.snapshot(sessionId, { db });
    const snapshots = await syncytium.listSnapshots(sessionId, { db });
    const replicas = await syncytium.inspectReplicas(sessionId, { db });
    const latest = snapshots.findLast(
      (snapshot) => snapshot.stateVersion === state.shared.totalOps
    );
    return {
      status: 'read',
      sessionId,
      shared: state.shared,
      consistency: state.consistency,
      snapshots,
      replicas,
      latest,
      totalOps: state.shared.totalOps,
      causalFrontier: state.shared.causalFrontier,
      invariantReceipts: state.consistency.invariantReceipts,
      failedInvariants: state.consistency.failedInvariants
    };
  } catch (error) {
    return { status: 'failed',
      reason: error.code || 'syncytium_state_unavailable', sessionId };
  }
}

module.exports = { read };
