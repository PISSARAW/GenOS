'use strict';

const crypto = require('node:crypto');
const { verifiedResolution } = require('./missionResolutionReceipt');
const RECEIPT_SOURCE = require('../ontogenesis/missionVerifierReceiptService').SOURCE;
const RECEIPT_SCHEMA = 'genos.ontogenesis-verifier-receipt/v1';
const PROOF_SCHEMA = 'genos.morphogenesis-verified-resolution/v1';

async function inspectEpochEvidence(state, orchestratorId) {
  const observed = [...state.results.values()];
  const completed = observed.filter((result) => result.status === 'completed');
  if (!observed.some(hasDiagnosticEvidence)) return { reason: 'no_completed_worker_evidence' };
  const resolution = await verifiedResolution(state, orchestratorId);
  if (resolution) {
    const proof = buildVerifiedResolutionProof(state, orchestratorId, resolution);
    if (proof) {
      bindVerifiedVerdict(state, resolution);
      return { reason: 'verified_resolution', payload: { verifiedResolutionProof: proof } };
    }
    return { reason: 'resolution_proof_invalid' };
  }
  return { completed, observed };
}

function buildVerifiedResolutionProof(state, orchestratorId, resolution) {
  const status = state.plan?.morphogenesisEpochStatus;
  const transition = status?.transition;
  const receipt = resolution?.receipt;
  const missionId = state.normalizedMission?.missionId || orchestratorId;
  if (!validQueuedTransition(transition) || !validResolutionBinding(resolution, missionId, transition)
    || !validOracleReceipt(receipt, missionId, transition)) return null;
  const verifiedNeedReceipts = transition.identity.resourceAllocation?.verifiedNeedReceipts || [];
  const body = { schema: PROOF_SCHEMA, transitionId: transition.transitionId,
    mission: { missionId, promptDigest: transition.identity.mission?.promptDigest || null },
    candidateId: transition.identity.candidateId,
    resourceAllocationCandidateId: transition.identity.resourceAllocation?.candidateId || null,
    oracleReceipt: receiptIdentity(receipt), verifierWorkerId: resolution.agentId,
    verifiedNeedReceipts: verifiedNeedReceipts.map((item) => ({ ...item })) };
  return { ...body, proofDigest: proofDigest(body) };
}

function validQueuedTransition(transition) {
  return Boolean(require('./morphogenesisTransitionReceipt').verifyTransitionReceipt(transition)
    && transition.dispatchStatus === 'queued' && transition.identity?.mission?.missionId
    && transition.identity?.candidateId);
}

function validResolutionBinding(resolution, missionId, transition) {
  const bindings = transition.identity.bindings || [];
  return resolution?.transitionId === transition.transitionId
    && transition.identity.mission.missionId === missionId
    && Boolean(resolution.agentId && bindings.some((item) => item.workerId === resolution.agentId));
}

function validOracleReceipt(receipt, missionId, transition) {
  return receipt?.schema === RECEIPT_SCHEMA && receipt.source === RECEIPT_SOURCE
    && receipt.missionId === missionId && receipt.transitionId === transition.transitionId
    && Boolean(receipt.workspaceRoot && receipt.checksDigest && receipt.treeHash);
}

function bindVerifiedVerdict(state, resolution) {
  // A sealed transition receipt alone never promotes: the oracle verdict must
  // bind the same transitionId, otherwise the mission stays unpromoted.
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

function receiptIdentity(receipt) {
  return { schema: receipt.schema, source: receipt.source, missionId: receipt.missionId,
    transitionId: receipt.transitionId, workspaceRoot: receipt.workspaceRoot,
    checksDigest: receipt.checksDigest, treeHash: receipt.treeHash,
    receiptDigest: receipt.receiptDigest || proofDigest(receipt) };
}

function proofDigest(value) {
  return `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

module.exports = { inspectEpochEvidence, bindVerifiedVerdict, buildVerifiedResolutionProof,
  PROOF_SCHEMA, proofDigest };
