'use strict';

const crypto = require('node:crypto');

const DEFAULT_POLICY = Object.freeze({
  maxAgeMs: 15 * 60 * 1000,
  minObservations: 3,
  driftThreshold: 0.2,
  maxCostUsd: 5,
  maxBlastRadius: 1
});

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty value is required.');
  return value.trim();
}

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeScope(input) {
  return {
    organizationId: required(input?.organizationId, 'SRE_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'SRE_PROJECT_REQUIRED'),
    serviceId: required(input?.serviceId, 'SRE_SERVICE_REQUIRED'),
    responsibilityAgentId: required(input?.responsibilityAgentId, 'SRE_RESPONSIBILITY_REQUIRED')
  };
}

function normalizePolicy(policy = {}) {
  return {
    maxAgeMs: Math.max(1, finite(policy.maxAgeMs, DEFAULT_POLICY.maxAgeMs)),
    minObservations: Math.max(2, Math.floor(finite(policy.minObservations, DEFAULT_POLICY.minObservations))),
    driftThreshold: Math.max(0, finite(policy.driftThreshold, DEFAULT_POLICY.driftThreshold)),
    maxCostUsd: Math.max(0, finite(policy.maxCostUsd, DEFAULT_POLICY.maxCostUsd)),
    maxBlastRadius: Math.max(0, finite(policy.maxBlastRadius, DEFAULT_POLICY.maxBlastRadius))
  };
}

function normalizedObservation(observation, nowMs, maxAgeMs) {
  const occurredAt = Date.parse(observation?.occurredAt);
  const value = Number(observation?.value);
  const baseline = Number(observation?.baseline);
  const sourceRef = typeof observation?.sourceRef === 'string' ? observation.sourceRef.trim() : '';
  if (!sourceRef || !Number.isFinite(occurredAt) || !Number.isFinite(value) || !Number.isFinite(baseline)) return null;
  if (occurredAt > nowMs || nowMs - occurredAt > maxAgeMs) return null;
  const denominator = Math.max(Math.abs(baseline), 1e-9);
  return { occurredAt: new Date(occurredAt).toISOString(), value, baseline, sourceRef,
    drift: Math.abs(value - baseline) / denominator };
}

function freshObservations(input, policy) {
  const nowMs = Date.parse(input?.now || new Date().toISOString());
  if (!Number.isFinite(nowMs)) throw coded('SRE_TIME_INVALID', 'now must be an ISO timestamp.');
  return (Array.isArray(input?.observations) ? input.observations : [])
    .map((item) => normalizedObservation(item, nowMs, policy.maxAgeMs))
    .filter(Boolean);
}

function noChange(scope, reason, observations) {
  return { decision: 'NO_CHANGE', status: 'MONITORING', scope, reason,
    evidenceRefs: observations.map((item) => item.sourceRef) };
}

function detectProductionDrift(input = {}) {
  const scope = normalizeScope(input);
  const policy = normalizePolicy(input.policy);
  const observations = freshObservations(input, policy);
  if (observations.length < policy.minObservations) {
    return noChange(scope, 'INSUFFICIENT_FRESH_EVIDENCE', observations);
  }
  const drifting = observations.filter((item) => item.drift >= policy.driftThreshold);
  if (drifting.length < policy.minObservations) return noChange(scope, 'DRIFT_NOT_REPRODUCED', observations);
  const identity = { ...scope, firstObservedAt: observations[0].occurredAt,
    evidenceRefs: observations.map((item) => item.sourceRef) };
  return { decision: 'OPEN_CAMPAIGN', status: 'DETECTED', campaignId: `sre_${digest(identity).slice(0, 24)}`,
    scope, responsibility: { agentId: scope.responsibilityAgentId, durable: true },
    risk: { score: Math.max(...drifting.map((item) => item.drift)), reproduced: true },
    evidenceRefs: identity.evidenceRefs, budget: { maxCostUsd: policy.maxCostUsd,
      maxBlastRadius: policy.maxBlastRadius }, circuitBreakerOpen: input.circuitBreakerOpen === true };
}

function validHypothesis(hypothesis) {
  return typeof hypothesis?.id === 'string' && hypothesis.id.trim()
    && typeof hypothesis?.prediction === 'string' && hypothesis.prediction.trim()
    && typeof hypothesis?.falsificationProbeRef === 'string' && hypothesis.falsificationProbeRef.trim()
    && Array.isArray(hypothesis?.evidenceRefs) && hypothesis.evidenceRefs.length > 0;
}

function causalRefsDistinct(receipt) {
  const refs = [receipt?.interventionRef, receipt?.controlRef, receipt?.outcomeRef];
  return refs.every((value) => typeof value === 'string' && value.trim()) && new Set(refs).size === refs.length;
}

function supportedHypotheses(hypotheses) {
  return hypotheses.filter((item) => item.supported === true && causalRefsDistinct(item.causalReceipt));
}

function candidateWithinBudget(candidate, budget) {
  const costUsd = Number(candidate?.costUsd);
  const blastRadius = Number(candidate?.blastRadius);
  return Number.isFinite(costUsd) && costUsd >= 0 && costUsd <= budget.maxCostUsd
    && Number.isFinite(blastRadius) && blastRadius >= 0 && blastRadius <= budget.maxBlastRadius;
}

function candidateShape(candidate) {
  return {
    actionKind: required(candidate?.actionKind, 'SRE_ACTION_KIND_REQUIRED'),
    changeRef: required(candidate?.changeRef, 'SRE_CHANGE_REF_REQUIRED'),
    rollbackRef: required(candidate?.rollbackRef, 'SRE_ROLLBACK_REF_REQUIRED'),
    costUsd: Number(candidate?.costUsd), blastRadius: Number(candidate?.blastRadius),
    requiredPermissions: [...new Set(Array.isArray(candidate?.requiredPermissions)
      ? candidate.requiredPermissions.filter((item) => typeof item === 'string' && item.trim()) : [])]
  };
}

function investigateCampaign(input = {}) {
  const campaign = input.campaign;
  if (campaign?.status !== 'DETECTED') throw coded('SRE_CAMPAIGN_STATE_INVALID', 'Campaign is not detected.');
  const hypotheses = Array.isArray(input.hypotheses) ? input.hypotheses : [];
  if (hypotheses.length < 2 || !hypotheses.every(validHypothesis)) {
    return { ...campaign, status: 'INVESTIGATING', decision: 'GATHER_EVIDENCE',
      reason: 'COMPETING_FALSIFIABLE_HYPOTHESES_REQUIRED' };
  }
  const supported = supportedHypotheses(hypotheses);
  if (supported.length !== 1) return { ...campaign, status: 'INVESTIGATING',
    decision: 'GATHER_EVIDENCE', reason: 'UNIQUE_CAUSAL_HYPOTHESIS_REQUIRED' };
  const candidate = candidateShape(input.candidate);
  if (!candidateWithinBudget(candidate, campaign.budget)) return { ...campaign,
    status: 'ABSTAINED', decision: 'NO_CHANGE', reason: 'CANDIDATE_OUTSIDE_BUDGET' };
  if (candidate.requiredPermissions.length === 0) return { ...campaign,
    status: 'ABSTAINED', decision: 'NO_CHANGE', reason: 'PERMISSIONS_UNDECLARED' };
  const candidateDigest = digest({ campaignId: campaign.campaignId,
    hypothesisId: supported[0].id, candidate });
  return { ...campaign, status: 'CANDIDATE_READY', decision: 'REQUEST_AUTHORIZATION',
    causalHypothesis: supported[0], rejectedHypothesisIds: hypotheses
      .filter((item) => item.id !== supported[0].id).map((item) => item.id),
    candidate: { ...candidate, digest: candidateDigest, authorized: false,
      executionStatus: 'NOT_EXECUTED' } };
}

module.exports = { DEFAULT_POLICY, detectProductionDrift, investigateCampaign };
