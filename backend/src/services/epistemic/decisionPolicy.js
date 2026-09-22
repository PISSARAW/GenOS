'use strict';

/**
 * Epistemic decision policy.
 *
 * Point 6 (validation-first) + Point 9 (evidence-gated emission).
 *
 * The policy is deterministic given the claim — it derives confidence from
 * evidence quality and applies stake-aware calibration. It does not invent
 * confidence; it routes claims through accept / accept-with-debt /
 * quarantine / reject / hold_for_human.
 */

const {
  VALIDATION_RULES,
  VERDICT,
  RULE_LEVELS,
  acceptClaim,
  acceptClaimBatch,
  STAKE_LEVELS,
  maxStakeLevel,
  confidenceWithStakes,
  calibrationGap,
  evidenceQuality,
  PHASE,
} = require('./validator');
const {
  publishClaimAccepted,
  publishClaimRejected,
  publishDebtCreated,
  publishContradiction,
} = require('./contradictionBus');

// Routing decisions

const ROUTE = Object.freeze({
  FORWARD: 'forward',
  FORWARD_WITH_DEBT: 'forward_with_debt',
  QUARANTINE: 'quarantine',
  REJECT: 'reject',
  HOLD_FOR_HUMAN: 'hold_for_human',
});

function isRoute(value) {
  return Object.values(ROUTE).includes(value);
}

// Policy configuration

const POLICY_DEFAULTS = Object.freeze({
  stakes: STAKE_LEVELS.NORMAL,
  decayCurve: 'short',
  minForwardConfidence: 0.4,
  maxQuarantineConfidence: 0.3,
  debtThreshold: 0.5,
  createDebtForBeliefBelow: 0.5,
  quarantineOnContradiction: true,
  forwardOnContradictionWithGapBelow: 0.3,
});

// Helpers — primitives (all ≤3 params, complexity ≤10)

function _isPlainClaim(claim) {
  return claim !== null && typeof claim === 'object';
}

function _normalizeStakes(optsStakes) {
  const stakes = optsStakes || POLICY_DEFAULTS.stakes;
  return maxStakeLevel(Array.isArray(stakes) ? stakes : [stakes]);
}

function _resolveDecayCurve(name) {
  const core = require('./core');
  return core.DECAY_CURVES[name] || core.DECAY_CURVES.short;
}

function _buildAcceptanceOpts(effectiveStakes, opts) {
  return {
    stakes: effectiveStakes,
    decayCurve: _resolveDecayCurve(opts.decayCurve),
    tails: opts.tails || 0,
    phase: opts.phase || null,
  };
}

function _runAcceptance(claim, runOpts) {
  return acceptClaim(claim, {
    stakes: runOpts.effectiveStakes,
    decayCurve: runOpts.decayCurve,
    tails: runOpts.tails,
    phase: null,
  });
}

function _extractQualityMetrics(metricsOpts) {
  const acceptance = metricsOpts.acceptance;
  const claim = metricsOpts.claim;
  const effectiveStakes = metricsOpts.effectiveStakes;
  const decayCurve = metricsOpts.decayCurve;
  const tails = metricsOpts.tails;
  const quality = evidenceQuality(claim);
  const calibrated = acceptance.validation ? acceptance.validation.calibratedConfidence : 0;
  const gap = calibrationGap(claim, effectiveStakes, decayCurve, tails);
  return { quality, calibrated, gap, acceptance };
}

// Helpers — route resolution (all ≤3 params)

function _resolveRouteForAccepted(acceptance, quality) {
  if (acceptance.validation.verdict === VERDICT.REQUIRES_DEBT) {
    return {
      route: ROUTE.FORWARD_WITH_DEBT,
      decision: 'accepted_with_debt',
      reason: acceptance.reason || 'Accepted but epistemic debt created.',
      debt: acceptance.debt || [],
    };
  }
  if (quality < POLICY_DEFAULTS.maxQuarantineConfidence) {
    return {
      route: ROUTE.QUARANTINE,
      decision: 'quarantined',
      reason: `Evidence quality ${quality.toFixed(2)} below quarantine threshold ${POLICY_DEFAULTS.maxQuarantineConfidence}.`,
      debt: [],
    };
  }
  return {
    route: ROUTE.FORWARD,
    decision: 'accepted',
    reason: 'Accepted and forwardable.',
    debt: [],
  };
}

function _resolveRouteForRejected(acceptance) {
  return {
    route: ROUTE.REJECT,
    decision: 'rejected',
    reason: acceptance.reason || 'Rejected by validation gate.',
    debt: [],
  };
}

function _shouldForwardPublish(route) {
  return route === ROUTE.FORWARD || route === ROUTE.FORWARD_WITH_DEBT;
}

function _shouldRejectPublish(route) {
  return route === ROUTE.REJECT;
}

function _shouldEmitDebtEvent(publishOpts) {
  const { route, acceptance } = publishOpts;
  return route === ROUTE.FORWARD_WITH_DEBT && acceptance.debt && acceptance.debt.length;
}

function _performPublishedSideEffects(publishOpts) {
  if (_shouldForwardPublish(publishOpts.route)) {
    publishClaimAccepted(publishOpts.claim, publishOpts.effectiveStakes);
  }
  if (_shouldRejectPublish(publishOpts.route)) {
    publishClaimRejected(publishOpts.claim, publishOpts.reason);
  }
  if (_shouldEmitDebtEvent(publishOpts)) {
    publishDebtCreated(publishOpts.acceptance.debt[0]);
  }
}

// Helpers — contradiction override (all ≤3 params)

function _contradictionConfig() {
  return {
    enabled: POLICY_DEFAULTS.quarantineOnContradiction,
    threshold: POLICY_DEFAULTS.forwardOnContradictionWithGapBelow,
  };
}

function _worstContradiction(consistencyIssues) {
  if (!consistencyIssues.length) return null;
  return consistencyIssues.reduce((a, b) => (a.gap > b.gap ? a : b));
}

function _applyContradictionOverride(overrideOpts) {
  const { route, decision, reason, consistencyIssues, claim } = overrideOpts;
  if (!_contradictionConfig().enabled) {
    return { route, decision, reason };
  }
  const claimIssues = consistencyIssues.filter((i) => i.claims && i.claims.includes(claim.id));
  const worst = _worstContradiction(claimIssues);
  if (!worst || worst.gap <= _contradictionConfig().threshold) {
    return { route, decision, reason };
  }
  if (route === ROUTE.FORWARD) {
    publishContradiction(worst.subject, [claim], worst.gap);
    return {
      route: ROUTE.HOLD_FOR_HUMAN,
      decision: 'held_for_human',
      reason: `Contradiction detected on subject ${worst.subject} (gap ${worst.gap.toFixed(2)}). Held for human review.`,
    };
  }
  return { route, decision, reason };
}

// Single-claim policy evaluation

function evaluatePolicy(claim, opts, precomputedConsistency) {
  if (!opts) opts = {};
  if (!_isPlainClaim(claim)) {
    return _invalidClaimResult();
  }

  const effectiveStakes = _normalizeStakes(opts.stakes);
  const decayCurve = _resolveDecayCurve(opts.decayCurve);
  const tails = opts.tails || 0;

  const acceptance = _runAcceptance(claim, { effectiveStakes, decayCurve, tails });
  const metrics = _extractQualityMetrics({ acceptance, claim, effectiveStakes, decayCurve, tails });
  const { quality, calibrated, gap } = metrics;

  const consistencyIssues = precomputedConsistency || checkClaimConsistency([claim]);

  let result;
  if (acceptance.accepted) {
    result = _resolveRouteForAccepted(acceptance, quality);
  } else {
    result = _resolveRouteForRejected(acceptance);
  }

  _performPublishedSideEffects({
    route: result.route,
    claim,
    effectiveStakes,
    acceptance,
    reason: result.reason,
  });

  const override = _applyContradictionOverride({
    route: result.route,
    decision: result.decision,
    reason: result.reason,
    consistencyIssues,
    claim,
  });

  return Object.freeze({
    route: override.route,
    decision: override.decision,
    reason: override.reason,
    claim: acceptance.claim || claim,
    acceptance,
    quality,
    calibrated,
    gap,
    stakes: effectiveStakes,
    consistencyIssues,
    debt: result.debt,
    phase: acceptance.claim ? acceptance.claim._phase : null,
  });
}

function _invalidClaimResult() {
  return Object.freeze({
    route: ROUTE.REJECT,
    decision: 'invalid_claim',
    reason: 'Claim is not a valid object.',
    claim: null,
    acceptance: null,
    quality: 0,
    calibrated: 0,
    gap: 0,
    stakes: POLICY_DEFAULTS.stakes,
    consistencyIssues: [],
    debt: [],
    phase: null,
  });
}

// Batch policy evaluation

function evaluatePolicyBatch(claims, opts) {
  if (!opts) opts = {};
  const effectiveStakes = _normalizeStakes(opts.stakes);

  const consistencyIssues = checkClaimConsistency(claims);
  const overrides = _collectContradictionOverrides(consistencyIssues, claims);

  const evaluations = claims.map((c) =>
    evaluatePolicy(c, Object.assign({}, opts, { stakes: effectiveStakes }), consistencyIssues),
  );

  const byRoute = {
    [ROUTE.FORWARD]: [],
    [ROUTE.FORWARD_WITH_DEBT]: [],
    [ROUTE.QUARANTINE]: [],
    [ROUTE.REJECT]: [],
    [ROUTE.HOLD_FOR_HUMAN]: [],
  };

  let totalDebt = 0;
  for (const e of evaluations) {
    byRoute[e.route].push(e);
    totalDebt += (e.debt || []).length;
  }

  return Object.freeze({
    evaluations,
    byRoute,
    overrides,
    summary: {
      total: claims.length,
      forward: byRoute[ROUTE.FORWARD].length,
      forwardWithDebt: byRoute[ROUTE.FORWARD_WITH_DEBT].length,
      quarantine: byRoute[ROUTE.QUARANTINE].length,
      rejected: byRoute[ROUTE.REJECT].length,
      heldForHuman: byRoute[ROUTE.HOLD_FOR_HUMAN].length,
      totalDebt,
    },
  });
}

function _collectContradictionOverrides(consistencyIssues, claims) {
  const overrides = [];
  for (const issue of consistencyIssues) {
    overrides.push({ subject: issue.subject, gap: issue.gap });
    publishContradiction(issue.subject, claims, issue.gap);
  }
  return overrides;
}

function selectAction(evaluation) {
  switch (evaluation.route) {
    case ROUTE.FORWARD:
      return { action: 'forward', label: 'Forward to decision stream' };
    case ROUTE.FORWARD_WITH_DEBT:
      return { action: 'forward_with_debt', label: 'Forward with epistemic debt attached' };
    case ROUTE.QUARANTINE:
      return { action: 'quarantine', label: 'Quarantine — insufficient evidence quality' };
    case ROUTE.REJECT:
      return { action: 'reject', label: 'Reject — validation rule failure' };
    case ROUTE.HOLD_FOR_HUMAN:
      return { action: 'hold_for_human', label: 'Hold for human review — contradiction detected' };
    default:
      return { action: 'unknown', label: 'Undetermined' };
  }
}

// Emission conditions (point 9)

function canEmit(evaluation) {
  if (evaluation.route === ROUTE.FORWARD || evaluation.route === ROUTE.FORWARD_WITH_DEBT) {
    return { emit: true, route: evaluation.route };
  }
  return { emit: false, route: evaluation.route, reason: evaluation.reason };
}

// Evidence-before-claims surface (point 9)

function shouldEmitClaim(claim, stakes) {
  const evaluation = evaluatePolicy(claim, { stakes });
  const action = selectAction(evaluation);
  return {
    emit: evaluation.route === ROUTE.FORWARD || evaluation.route === ROUTE.FORWARD_WITH_DEBT,
    route: evaluation.route,
    action: action.action,
    label: action.label,
    evaluation,
  };
}

// Severity escalation for debt (used by stability gates)

function escalateDebtIfCritical(debt, currentStakes) {
  if (!debt) return debt;
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  const current = rank[debt.severity] || 0;
  const stakeVal = rank[currentStakes] || 0;
  if (stakeVal >= 3 && current < 3) {
    return {
      ...debt,
      severity: stakeVal >= 4 ? 'critical' : 'high',
    };
  }
  return debt;
}

module.exports = {
  ROUTE,
  isRoute,
  POLICY_DEFAULTS,
  evaluatePolicy,
  evaluatePolicyBatch,
  selectAction,
  canEmit,
  shouldEmitClaim,
  escalateDebtIfCritical,
  checkClaimConsistency: require('./contradictionDetection').checkClaimConsistency,
  publishContradiction,
  publishClaimAccepted,
  publishClaimRejected,
  publishDebtCreated,
};
