'use strict';

const { verifiedResolution } = require('./missionResolutionReceipt');

async function inspectEpochEvidence(state, orchestratorId) {
  const observed = [...state.results.values()];
  const completed = observed.filter((result) => result.status === 'completed');
  if (!observed.some(hasDiagnosticEvidence)) return { reason: 'no_completed_worker_evidence' };
  const resolution = await verifiedResolution(state, orchestratorId);
  if (resolution) {
    bindVerifiedVerdict(state, resolution);
    return { reason: 'verified_resolution', payload: resolutionPayload(resolution) };
  }
  return { completed, observed };
}

function bindVerifiedVerdict(state, resolution) {
  const receipt = state.plan.morphogenesisEpochStatus?.transition;
  if (!receipt) return;
  if (resolution.transitionId !== receipt.transitionId) {
    receipt.verdict = { status: 'blocked', reason: 'transition_identity_mismatch' };
    return;
  }
  receipt.verdict = { status: 'verified', transitionId: resolution.transitionId,
    receiptId: resolution.receipt.receiptDigest || resolution.receipt.treeHash || null,
    verifierWorkerId: resolution.agentId };
}

function hasDiagnosticEvidence(result) {
  return Boolean(result && (result.status === 'completed'
    || (typeof result.payload === 'object' && Object.keys(result.payload).length)));
}

function resolutionPayload(resolution) {
  return { receiptId: resolution.receipt.receiptDigest || resolution.receipt.treeHash || null,
    verifierWorkerId: resolution.agentId, transitionId: resolution.transitionId || null };
}

module.exports = { inspectEpochEvidence };
