'use strict';

const { createHash } = require('crypto');

function relayTeamFullPotential(mission, members) {
  const ownerPair = resolveOwnerPair(members);
  if (!ownerPair.prevOwner || !ownerPair.nextOwner) {
    throw new Error('Relay team requires at least 2 members for handoff.');
  }

  const params = buildRelayParams(mission);
  validateParams(params);

  const canonicalPayload = buildCanonicalPayload(params, ownerPair);
  const digest = computeDigest(canonicalPayload);

  return {
    cryptographic_versioned_handoff: buildCryptographicHandoff({ canonicalPayload, digest, params }),
    receiver_validation: buildReceiverValidation(),
    controlled_summary: buildControlledSummary(params),
    state_ownership_lease: buildOwnershipLease({ ownerPair, params }),
    rollback_to_previous_owner: buildRollbackConfig(ownerPair.prevOwner)
  };
}

function resolveOwnerPair(members) {
  return {
    prevOwner: members[0] && (members[0].memberId || members[0].agentId || members[0].workerId),
    nextOwner: members[1] && (members[1].memberId || members[1].agentId || members[1].workerId)
  };
}

function buildRelayParams(mission) {
  return {
    sequence: Number(mission.handoffSequence) || 1,
    version: Number(mission.handoffVersion) || 1,
    summary: mission.handoffSummary || '',
    summaryMaxLength: Number(mission.summaryMaxLength) || 500,
    state: mission.handoffState || {},
    artifactRefs: mission.artifactRefs || [],
    evidenceRefs: mission.evidenceRefs || [],
    leaseDurationMinutes: Number(mission.leaseDurationMinutes) || 30
  };
}

function validateParams(params) {
  if (!params.evidenceRefs.length) {
    throw new Error('Relay handoff requires at least one evidence reference.');
  }
  if (params.summary.length > params.summaryMaxLength) {
    throw new Error(`Relay summary exceeds max length of ${params.summaryMaxLength}.`);
  }
}

function buildCanonicalPayload(params, ownerPair) {
  return {
    version: params.version,
    sequence: params.sequence,
    previousOwner: ownerPair.prevOwner,
    nextOwner: ownerPair.nextOwner,
    summary: params.summary,
    context: params.state,
    artifactRefs: params.artifactRefs,
    evidenceRefs: params.evidenceRefs
  };
}

function computeDigest(payload) {
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(canonicalString).digest('hex');
}

function buildCryptographicHandoff({ canonicalPayload, digest, params }) {
  return {
    payload: canonicalPayload,
    digest,
    version: params.version,
    sequence: params.sequence,
    integrityProtected: true,
    hashAlgorithm: 'sha256'
  };
}

function buildReceiverValidation() {
  return {
    required: true,
    digestVerification: true,
    payloadIntegrityCheck: true,
    receiverMustAcceptOrReject: true,
    rejectionRollbackEnabled: true
  };
}

function buildControlledSummary(params) {
  return {
    summary: params.summary,
    maxLength: params.summaryMaxLength,
    requiredSections: ['context', 'decisions', 'open_issues', 'next_actions'],
    summaryHash: createHash('sha256').update(params.summary).digest('hex').substring(0, 16)
  };
}

function buildOwnershipLease({ ownerPair, params }) {
  return {
    leaseId: createHash('sha256').update(`${ownerPair.prevOwner}-${ownerPair.nextOwner}-${Date.now()}`).digest('hex').substring(0, 16),
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + params.leaseDurationMinutes * 60000).toISOString(),
    leaseDurationMinutes: params.leaseDurationMinutes,
    singleHolderEnforced: true,
    ownershipTransferAtomic: true
  };
}

function buildRollbackConfig(prevOwner) {
  return {
    enabled: true,
    previousOwner: prevOwner,
    triggerConditions: ['receiver_rejection', 'validation_failure', 'timeout', 'explicit_request'],
    rollbackPreservesState: true,
    rollbackRequiresEvidence: true
  };
}

module.exports = { relayTeamFullPotential };
