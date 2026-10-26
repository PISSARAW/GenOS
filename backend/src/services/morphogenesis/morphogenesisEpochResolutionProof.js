'use strict';

const evidence = require('./morphogenesisEpochEvidence');
const transitionReceipts = require('./morphogenesisTransitionReceipt');

function terminalResolutionProof(state, reason, payload) {
  if (reason !== 'verified_resolution') return null;
  const proof = payload.verifiedResolutionProof;
  const transition = state.plan?.morphogenesisEpochStatus?.transition;
  return transitionMatchesProof(proof, transition) ? proof : null;
}

function transitionMatchesProof(proof, transition) {
  return Boolean(proof && transition && transitionReceipts.verifyTransitionReceipt(transition)
    && transition.dispatchStatus === 'queued' && identityMatchesProof(proof, transition)
    && verdictMatches(transition) && oracleReceiptMatches(proof, transition)
    && verifierMatches(proof, transition.identity) && needReceiptsMatch(proof, transition.identity)
    && digestMatches(proof));
}

function identityMatchesProof(proof, transition) {
  const identity = transition.identity;
  return proof.schema === evidence.PROOF_SCHEMA && proof.transitionId === transition.transitionId
    && proof.mission?.missionId === identity.mission?.missionId
    && proof.mission?.promptDigest === (identity.mission?.promptDigest || null)
    && proof.candidateId === identity.candidateId
    && proof.resourceAllocationCandidateId === (identity.resourceAllocation?.candidateId || null);
}

function verdictMatches(transition) {
  return transition.verdict?.status === 'verified'
    && transition.verdict.transitionId === transition.transitionId;
}

function oracleReceiptMatches(proof, transition) {
  const receipt = proof.oracleReceipt;
  return receipt?.transitionId === transition.transitionId
    && receipt?.missionId === transition.identity.mission?.missionId
    && receipt?.schema === 'genos.ontogenesis-verifier-receipt/v1'
    && receipt?.source === 'ontogenesis-independent-verifier'
    && Boolean(receipt.workspaceRoot && receipt.checksDigest && receipt.treeHash);
}

function verifierMatches(proof, identity) {
  return Boolean(proof.verifierWorkerId
    && identity.bindings.some((item) => item.workerId === proof.verifierWorkerId));
}

function needReceiptsMatch(proof, identity) {
  const needs = identity.resourceAllocation?.verifiedNeedReceipts || [];
  return JSON.stringify(proof.verifiedNeedReceipts || []) === JSON.stringify(needs);
}

function digestMatches(proof) {
  const { proofDigest, ...body } = proof;
  return typeof proofDigest === 'string' && proofDigest === evidence.proofDigest(body);
}

module.exports = { terminalResolutionProof };
