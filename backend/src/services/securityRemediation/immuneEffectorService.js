'use strict';

const verifier = require('./campaignAdjudicator');
const { CAMPAIGN_SCHEMA } = require('./remediationCampaignPlanner');
const { fingerprint } = require('../stateFingerprint');

const ALLOWED_OPERATIONS = Object.freeze(['edit_workspace_copy', 'run_local_tests',
  'run_static_analysis', 'run_safe_reproduction_fixture']);

function requireExecutionContract(input) {
  if (input?.authorization?.requiresExplicitAuthorization !== true) {
    throw new Error('immune-effector-explicit-authorization-required');
  }
  if (!validCampaign(input.campaign)) throw new Error('SECURITY_REMEDIATION_CAMPAIGN_REQUIRED');
  for (const name of ['verifyAuthorization', 'createNursery', 'applyCandidate',
    'runLocalOracles', 'verifyIndependently']) {
    if (typeof input[name] !== 'function') throw new Error(`immune-effector-${name}-required`);
  }
}

function validCandidate(candidate, sourceDigest) {
  const safety = candidate?.safety;
  return candidate?.promotionEligible === false && candidate.isolation?.mode === 'copy_on_write'
    && candidate.isolation.network === 'disabled' && candidate.isolation.sourceDigest === sourceDigest
    && safety?.liveTargetAccess === false && safety.exploitPayloadExecution === false
    && Array.isArray(safety.allowedOperations)
    && safety.allowedOperations.length === ALLOWED_OPERATIONS.length
    && ALLOWED_OPERATIONS.every((operation) => safety.allowedOperations.includes(operation));
}

function validCampaign(campaign) {
  if (campaign?.schema !== CAMPAIGN_SCHEMA || campaign.promotionEligible !== false
      || campaign.executionPolicy?.isolatedWorkspaceRequired !== true
      || campaign.executionPolicy.independentVerificationRequired !== true
      || campaign.executionPolicy.realExploitExecutionAllowed !== false
      || !Array.isArray(campaign.candidates) || !campaign.candidates.length) return false;
  const body = { ...campaign };
  delete body.campaignHash;
  return campaign.campaignHash === fingerprint(body)
    && campaign.candidates.every((candidate) => validCandidate(candidate, campaign.sourceDigest));
}

function isolatedNursery(nursery, candidate) {
  return nursery?.isolated === true && nursery.network === 'disabled'
    && nursery.workspaceId === candidate.isolation?.workspaceId
    && nursery.sourceDigest === candidate.isolation?.sourceDigest;
}

function outcomeStatus(candidate, checks) {
  const control = candidate.family === 'control';
  const expectedScanner = control ? 'present' : 'cleared';
  const expectedPath = control ? 'reachable' : 'blocked';
  const valid = checks.scannerOutcome === expectedScanner
    && checks.safePathReproduction === expectedPath
    && checks.functionalInvariants === 'passed' && checks.newHazards === 'none'
    && Number(checks.metrics?.remainingAlerts) >= 0;
  return valid ? 'verified' : 'refuted';
}

async function executeCandidate(input, candidate) {
  if (candidate.status === 'blocked_by_negative_memory') return null;
  const nursery = await input.createNursery({ candidate,
    isolation: candidate.isolation, network: 'disabled' });
  if (!isolatedNursery(nursery, candidate)) throw new Error('immune-effector-isolation-attestation-invalid');
  const applied = await input.applyCandidate({ candidate, nursery,
    allowedOperations: candidate.safety.allowedOperations });
  const oracleResult = await input.runLocalOracles({ candidate, nursery, applied,
    checks: candidate.requiredEvidence, exploitPayloadExecution: false });
  if (!oracleResult?.evidenceRef || !oracleResult.checks) throw new Error('immune-effector-oracle-evidence-required');
  const attestations = await input.verifyIndependently({ candidate, nursery, oracleResult,
    minimumVerifiers: Math.max(2, Number(input.quorum) || 2) });
  if (!Array.isArray(attestations) || attestations.length < Math.max(2, Number(input.quorum) || 2)) {
    throw new Error('immune-effector-independent-verifier-quorum-required');
  }
  const receipts = attestations.map((attestation) => verifier.createVerifierReceipt({
    candidateId: candidate.id, verifierId: attestation.verifierId,
    status: outcomeStatus(candidate, attestation.checks), evidenceRef: attestation.evidenceRef,
    checks: attestation.checks }));
  return { candidateId: candidate.id, nurseryId: nursery.id || nursery.workspaceId, receipts,
    promotionEligible: false };
}

async function executeCampaign(input) {
  requireExecutionContract(input);
  const authority = await input.verifyAuthorization({ authorization: input.authorization,
    campaignHash: input.campaign.campaignHash, operation: 'execute_isolated_remediation' });
  if (authority?.authorized !== true || typeof authority.evidenceRef !== 'string') {
    throw new Error('immune-effector-authorization-not-verified');
  }
  const results = [];
  for (const candidate of input.campaign.candidates) {
    const result = await executeCandidate(input, candidate);
    if (result) results.push(result);
  }
  const receipts = results.flatMap((result) => result.receipts);
  const adjudication = verifier.adjudicateCampaign(input.campaign, receipts, { quorum: input.quorum || 2 });
  const winner = adjudication.recommendations[0] || null;
  const canaryAdmission = winner && typeof input.canaryGate === 'function'
    ? await input.canaryGate({ recommendation: winner, adjudication,
      requiresExistingPromotionGate: true, promotionEligible: false }) : null;
  return { results, adjudication, winner: winner?.candidateId || null,
    canaryAdmission, authorizationEvidenceRef: authority.evidenceRef,
    requiresExplicitAuthorization: true, promotionEligible: false };
}

module.exports = { executeCampaign, executeCandidate, outcomeStatus };
