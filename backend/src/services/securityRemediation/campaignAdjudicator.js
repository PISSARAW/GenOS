'use strict';

const { fingerprint } = require('../stateFingerprint');
const immuneMemory = require('../immuneMemoryService');
const { CAMPAIGN_SCHEMA } = require('./remediationCampaignPlanner');

const RECEIPT_SCHEMA = 'genos.security-remediation-verifier-receipt/v1';
const ADJUDICATION_SCHEMA = 'genos.security-remediation-adjudication/v1';

function failure(code) { return Object.assign(new Error(code), { code }); }

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw failure(code);
  return value.trim();
}

function createVerifierReceipt(input) {
  const checks = input?.checks;
  if (!checks || typeof checks !== 'object') throw failure('SECURITY_VERIFIER_CHECKS_REQUIRED');
  const body = { schema: RECEIPT_SCHEMA,
    candidateId: required(input.candidateId, 'SECURITY_VERIFIER_CANDIDATE_REQUIRED'),
    verifierId: required(input.verifierId, 'SECURITY_VERIFIER_ID_REQUIRED'),
    status: required(input.status, 'SECURITY_VERIFIER_STATUS_REQUIRED'),
    evidenceRef: required(input.evidenceRef, 'SECURITY_VERIFIER_EVIDENCE_REQUIRED'),
    checks: { scannerOutcome: checks.scannerOutcome,
      safePathReproduction: checks.safePathReproduction,
      functionalInvariants: checks.functionalInvariants, newHazards: checks.newHazards,
      metrics: { remainingAlerts: Number(checks.metrics?.remainingAlerts),
        invariantFailures: Number(checks.metrics?.invariantFailures),
        newHazards: Number(checks.metrics?.newHazards),
        diffLines: Number(checks.metrics?.diffLines) } },
    promotionEligible: false };
  if (!['verified', 'refuted', 'inconclusive'].includes(body.status)
      || Object.values(body.checks.metrics).some((value) => !Number.isFinite(value) || value < 0)) {
    throw failure('SECURITY_VERIFIER_RECEIPT_INVALID');
  }
  return { ...body, receiptHash: fingerprint(body) };
}

function verifiedReceipt(receipt, candidate) {
  if (receipt?.schema !== RECEIPT_SCHEMA || receipt.candidateId !== candidate.id
      || receipt.verifierId === candidate.producerId) throw failure('SECURITY_VERIFIER_RECEIPT_INVALID');
  const body = { ...receipt };
  delete body.receiptHash;
  if (receipt.receiptHash !== fingerprint(body) || receipt.promotionEligible !== false) {
    throw failure('SECURITY_VERIFIER_RECEIPT_INVALID');
  }
  return receipt;
}

function receiptsByCandidate(campaign, receipts) {
  const candidates = new Map(campaign.candidates.map((candidate) => [candidate.id, candidate]));
  const grouped = new Map();
  for (const receipt of receipts || []) {
    const candidate = candidates.get(receipt?.candidateId);
    if (!candidate) throw failure('SECURITY_VERIFIER_CANDIDATE_UNKNOWN');
    const verified = verifiedReceipt(receipt, candidate);
    grouped.set(candidate.id, [...(grouped.get(candidate.id) || []), verified]);
  }
  return grouped;
}

function commonChecks(receipts) {
  return receipts.every((receipt) => receipt.status === 'verified'
    && receipt.checks.functionalInvariants === 'passed'
    && receipt.checks.newHazards === 'none');
}

function baselineOutcome(candidate, receipts, quorum) {
  const actors = new Set(receipts.map((receipt) => receipt.verifierId));
  const valid = actors.size >= quorum && commonChecks(receipts)
    && receipts.every((receipt) => receipt.checks.scannerOutcome === 'present'
      && receipt.checks.safePathReproduction === 'reachable');
  return { candidateId: candidate.id, clusterId: candidate.clusterId, family: candidate.family,
    causeHash: candidate.causeHash, disposition: valid ? 'baseline' : 'rejected',
    reasons: valid ? [] : ['verified_control_baseline_required'], receipts };
}

function candidateOutcome(input) {
  const { candidate, receipts, control, quorum } = input;
  if (candidate.status === 'blocked_by_negative_memory') {
    return { candidateId: candidate.id, clusterId: candidate.clusterId, family: candidate.family,
      causeHash: candidate.causeHash, disposition: 'blocked', reasons: ['negative_memory'], receipts: [] };
  }
  const actors = new Set(receipts.map((receipt) => receipt.verifierId));
  const baselineAlerts = control?.receipts?.[0]?.checks?.metrics?.remainingAlerts ?? -1;
  const conditions = [actors.size >= quorum, commonChecks(receipts),
    receipts.every((receipt) => receipt.checks.scannerOutcome === 'cleared'),
    receipts.every((receipt) => receipt.checks.safePathReproduction === 'blocked'),
    control?.disposition === 'baseline', receipts.length > 0 && receipts.every((receipt) =>
      receipt.checks.metrics.remainingAlerts < baselineAlerts)];
  const reasons = ['independent_quorum_missing', 'verification_failed', 'scanner_not_cleared',
    'safe_reproduction_not_blocked', 'control_baseline_missing', 'not_better_than_control']
    .filter((_, index) => !conditions[index]);
  return { candidateId: candidate.id, clusterId: candidate.clusterId, family: candidate.family,
    causeHash: candidate.causeHash, disposition: reasons.length ? 'rejected' : 'qualified',
    reasons, receipts };
}

function averageMetrics(outcome) {
  const totals = outcome.receipts.reduce((sum, receipt) => ({
    remainingAlerts: sum.remainingAlerts + receipt.checks.metrics.remainingAlerts,
    invariantFailures: sum.invariantFailures + receipt.checks.metrics.invariantFailures,
    newHazards: sum.newHazards + receipt.checks.metrics.newHazards,
    diffLines: sum.diffLines + receipt.checks.metrics.diffLines
  }), { remainingAlerts: 0, invariantFailures: 0, newHazards: 0, diffLines: 0 });
  return Object.fromEntries(Object.entries(totals).map(([key, value]) =>
    [key, value / outcome.receipts.length]));
}

function selectRecommendations(outcomes) {
  const grouped = new Map();
  for (const outcome of outcomes.filter((item) => item.disposition === 'qualified')) {
    grouped.set(outcome.clusterId, [...(grouped.get(outcome.clusterId) || []), outcome]);
  }
  return [...grouped.values()].map((group) => [...group].sort((left, right) => {
    const a = averageMetrics(left);
    const b = averageMetrics(right);
    return a.remainingAlerts - b.remainingAlerts || a.newHazards - b.newHazards
      || a.invariantFailures - b.invariantFailures || a.diffLines - b.diffLines
      || left.candidateId.localeCompare(right.candidateId);
  })[0]).map((outcome) => ({ ...outcome, metrics: averageMetrics(outcome),
    recommended: true, promotionEligible: false }));
}

function adjudicateCampaign(campaign, receipts, options = {}) {
  if (campaign?.schema !== CAMPAIGN_SCHEMA || !Array.isArray(campaign.candidates)) {
    throw failure('SECURITY_REMEDIATION_CAMPAIGN_REQUIRED');
  }
  const quorum = Math.max(2, Number(options.quorum || 2));
  const grouped = receiptsByCandidate(campaign, receipts);
  const controls = new Map(campaign.candidates.filter((candidate) => candidate.family === 'control')
    .map((candidate) => [candidate.clusterId, baselineOutcome(candidate,
      grouped.get(candidate.id) || [], quorum)]));
  const outcomes = campaign.candidates.map((candidate) => candidate.family === 'control'
    ? controls.get(candidate.clusterId) : candidateOutcome({ candidate,
      receipts: grouped.get(candidate.id) || [], control: controls.get(candidate.clusterId),
      quorum }));
  const recommendations = selectRecommendations(outcomes);
  const body = { schema: ADJUDICATION_SCHEMA, campaignHash: campaign.campaignHash,
    outcomes, recommendations, requiresExistingPromotionGate: true, promotionEligible: false };
  return { ...body, adjudicationHash: fingerprint(body) };
}

function evidenceDossierProjection(adjudication) {
  const claims = adjudication.recommendations.map((item) => ({ id: `claim-${item.candidateId}`,
    statement: `Candidate ${item.candidateId} remediates antigen cluster ${item.clusterId} under safe fixture verification.` }));
  const evidence = adjudication.recommendations.flatMap((item) => item.receipts.map((receipt) => ({
    claimId: `claim-${item.candidateId}`, kind: 'supporting', status: 'verified',
    sourceRef: receipt.evidenceRef, sourceHash: receipt.receiptHash,
    producerId: item.candidateId, verifierId: receipt.verifierId,
    payload: { checks: receipt.checks, receiptHash: receipt.receiptHash } })));
  const body = { schema: 'genos.security-remediation-evidence-projection/v1', claims, evidence,
    falsifications: adjudication.outcomes.filter((item) => item.disposition === 'rejected'),
    policy: { minIndependentVerifiers: 2, requireFalsification: true },
    requiresExistingPromotionGate: true, promotionEligible: false };
  return { ...body, projectionHash: fingerprint(body) };
}

function enrollRejectedCandidates(organism, adjudication) {
  return adjudication.outcomes.filter((item) => item.disposition === 'rejected'
    && item.family !== 'control').reduce((updated, item) => immuneMemory.enrollImmuneMemory(updated, {
      failureCategory: 'security-remediation', strategy: item.family,
      contextFingerprint: item.causeHash, preferredResponse: 'replace_strategy'
    }), organism);
}

module.exports = { RECEIPT_SCHEMA, ADJUDICATION_SCHEMA, createVerifierReceipt,
  adjudicateCampaign, evidenceDossierProjection, enrollRejectedCandidates };
