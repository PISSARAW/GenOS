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

function authorizationBlocked(plan, reason) {
  return { ...plan, status: 'CANDIDATE_READY', decision: 'AUTHORIZATION_BLOCKED', reason,
    candidate: { ...plan.candidate, authorized: false, executionStatus: 'NOT_EXECUTED' } };
}

function permissionsCover(requiredPermissions, grantedPermissions) {
  const granted = new Set(Array.isArray(grantedPermissions) ? grantedPermissions : []);
  return requiredPermissions.every((permission) => granted.has(permission));
}

function authorizeCandidate(input = {}) {
  const plan = input.plan;
  const receipt = input.authorizationReceipt;
  if (plan?.status !== 'CANDIDATE_READY') {
    throw coded('SRE_CANDIDATE_STATE_INVALID', 'Candidate is not awaiting authorization.');
  }
  if (plan.circuitBreakerOpen === true) return authorizationBlocked(plan, 'CIRCUIT_BREAKER_OPEN');
  const nowMs = Date.parse(input.now || new Date().toISOString());
  const expiresAt = Date.parse(receipt?.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    return authorizationBlocked(plan, 'AUTHORIZATION_EXPIRED');
  }
  if (receipt?.candidateDigest !== plan.candidate.digest) {
    return authorizationBlocked(plan, 'CANDIDATE_DIGEST_MISMATCH');
  }
  if (!permissionsCover(plan.candidate.requiredPermissions, receipt?.grantedPermissions)) {
    return authorizationBlocked(plan, 'PERMISSION_MISSING');
  }
  const principalId = required(receipt?.principalId, 'SRE_AUTHORITY_PRINCIPAL_REQUIRED');
  const authorityRef = required(receipt?.evidenceRef, 'SRE_AUTHORITY_EVIDENCE_REQUIRED');
  return { ...plan, status: 'AUTHORIZED', decision: 'AWAIT_EXTERNAL_EXECUTION',
    authority: { principalId, evidenceRef: authorityRef, expiresAt: receipt.expiresAt },
    candidate: { ...plan.candidate, authorized: true, executionStatus: 'NOT_EXECUTED' } };
}

function unknownEffect(plan, reason) {
  return { ...plan, status: 'OBSERVING', decision: 'WAIT_FOR_EVIDENCE', reason,
    productionEffect: { status: 'UNKNOWN', evidenceRefs: [] },
    agentLearning: { status: 'INELIGIBLE', reason: 'PRODUCTION_EFFECT_UNVERIFIED' } };
}

function normalizedWindow(item, context) {
  const observedAt = Date.parse(item?.observedAt);
  const score = Number(item?.healthScore);
  const baseline = Number(item?.baselineHealthScore);
  const evidenceRef = typeof item?.evidenceRef === 'string' ? item.evidenceRef.trim() : '';
  const verifierId = typeof item?.verifierId === 'string' ? item.verifierId.trim() : '';
  if (!Number.isFinite(observedAt) || observedAt <= context.appliedAt || observedAt > context.nowMs) return null;
  if (!Number.isFinite(score) || !Number.isFinite(baseline) || !evidenceRef || !verifierId) return null;
  return { observedAt, score, baseline, evidenceRef, verifierId,
    delta: score - baseline };
}

function observationContext(input, receipt) {
  const nowMs = Date.parse(input.now || new Date().toISOString());
  const appliedAt = Date.parse(receipt.appliedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(appliedAt) || appliedAt > nowMs) {
    throw coded('SRE_ACTION_TIME_INVALID', 'Action timing is invalid.');
  }
  return { nowMs, appliedAt };
}

function rollbackRequired(plan, windows, reason) {
  return { ...plan, status: 'ROLLBACK_REQUIRED', decision: 'REQUEST_ROLLBACK', reason,
    rollback: { authorized: false, executionStatus: 'NOT_EXECUTED',
      planRef: plan.candidate.rollbackRef },
    productionEffect: { status: 'REGRESSED',
      evidenceRefs: windows.map((item) => item.evidenceRef) },
    agentLearning: { status: 'REJECTED', reason: 'PRODUCTION_REGRESSION' } };
}

function verifiedEffect(plan, windows, actionReceipt) {
  return { ...plan, status: 'VERIFIED', decision: 'CLOSE_CAMPAIGN',
    productionEffect: { status: 'IMPROVED', productionChangeRef: actionReceipt.productionChangeRef,
      evidenceRefs: windows.map((item) => item.evidenceRef), windowCount: windows.length },
    agentLearning: { status: 'ELIGIBLE', source: 'VERIFIED_PRODUCTION_EFFECT',
      candidateDigest: plan.candidate.digest } };
}

function evaluatePostAction(input = {}) {
  const plan = input.plan;
  if (plan?.status !== 'AUTHORIZED') {
    throw coded('SRE_AUTHORIZED_STATE_REQUIRED', 'Post-action verification requires authorization.');
  }
  const receipt = input.actionReceipt;
  if (receipt?.executionStatus !== 'APPLIED' || !receipt.productionChangeRef) {
    return unknownEffect(plan, 'ACTION_EVIDENCE_MISSING');
  }
  if (receipt.candidateDigest !== plan.candidate.digest) {
    return unknownEffect(plan, 'ACTION_CANDIDATE_MISMATCH');
  }
  const context = observationContext(input, receipt);
  const windows = (Array.isArray(input.observationWindows) ? input.observationWindows : [])
    .map((item) => normalizedWindow(item, context)).filter(Boolean);
  const minimumWindows = Math.max(2, Math.floor(finite(input.minimumWindows, 2)));
  if (input.circuitBreakerOpen === true) return rollbackRequired(plan, windows, 'CIRCUIT_BREAKER_OPEN');
  const tolerance = Math.max(0, finite(input.regressionTolerance, 0));
  if (windows.some((item) => item.delta < -tolerance)) {
    return rollbackRequired(plan, windows, 'PRODUCTION_REGRESSION');
  }
  if (windows.length < minimumWindows) return unknownEffect(plan, 'LONGITUDINAL_WINDOW_INCOMPLETE');
  const excluded = new Set([plan.scope.responsibilityAgentId, plan.authority.principalId]);
  if (windows.some((item) => excluded.has(item.verifierId))) {
    return unknownEffect(plan, 'INDEPENDENT_VERIFIER_REQUIRED');
  }
  const improvement = Math.max(0, finite(input.minimumImprovement, 0));
  if (windows.every((item) => item.delta >= improvement)) {
    return verifiedEffect(plan, windows, receipt);
  }
  return unknownEffect(plan, 'PRODUCTION_EFFECT_INCONCLUSIVE');
}

module.exports = { DEFAULT_POLICY, detectProductionDrift, investigateCampaign,
  authorizeCandidate, evaluatePostAction };
