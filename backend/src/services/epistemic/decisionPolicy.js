'use strict';

/**
 * Epistemic decision policy.
 *
 * Point 6 (validation-first) + Point 9 (evidence-gated emission).
 *
 * Lays out the decision policy that turns a claim + stakes into a routing
 * decision: accept-and-forward, accept-with-debt, quarantine, or reject.
 *
 * The policy is deterministic given the claim — it does not invent confidence,
 * it derives it from evidence quality and applies stake-aware calibration.
 */

const {
  VALIDATION_RULES,
  VERDICT,
  RULE_LEVELS,
  acceptClaim,
  acceptClaimBatch,
  checkClaimConsistency,
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

// ---------------------------------------------------------------------------
// Routing decisions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Policy configuration
// ---------------------------------------------------------------------------

const POLICY_DEFAULTS = Object.freeze({
  stakes: STAKE_LEVELS.NORMAL,
  decayCurve: 'short',
  minForwardConfidence: 0.4,
  maxQuarantineConfidence: 0.3,
  debtThreshold: 0.5, // evidence quality below this may create debt
  createDebtForBeliefBelow: 0.5,
  quarantineOnContradiction: true,
  forwardOnContradictionWithGapBelow: 0.3,
});

// ---------------------------------------------------------------------------
// Single-claim policy evaluation
// ---------------------------------------------------------------------------

function evaluatePolicy(claim, opts = {}) {
  if (!claim || typeof claim !== 'object') {
    return {
      route: ROUTE.REJECT,
      decision: 'invalid_claim',
      reason: 'Claim is not a valid object.',
    };
  }

  const stakes = opts.stakes || POLICY_DEFAULTS.stakes;
  const effectiveStakes = maxStakeLevel(Array.isArray(stakes) ? stakes : [stakes]);
  const decayCurve = require('./core').DECAY_CURVES[opts.decayCurve] || require('./core').DECAY_CURVES.short;

  const acceptance = acceptClaim(claim, {
    stakes: effectiveStakes,
    decayCurve,
    tails: opts.tails || 0,
    phase: opts.phase || null,
  });

  const quality = evidenceQuality(claim);
  const calibrated = acceptance.validation ? acceptance.validation.calibratedConfidence : 0;
  const gap = calibrationGap(claim, effectiveStakes, decayCurve, opts.tails || 0);

  // Consistency check across the single claim is trivial; for single claims
  // we only flag if the claim carries a self-contradictory probability field.
  const consistencyIssues = checkClaimConsistency([claim]);

  let route;
  let decision;
  let reason;
  let debt;

  if (acceptance.accepted) {
    if (acceptance.validation.verdict === VERDICT.REQUIRES_DEBT) {
      route = ROUTE.FORWARD_WITH_DEBT;
      decision = 'accepted_with_debt';
      reason = acceptance.reason || 'Accepted but epistemic debt created.';
      debt = acceptance.debt || [];
      if (debt.length) publishDebtCreated(debt[0]);
    } else if (quality < POLICY_DEFAULTS.maxQuarantineConfidence) {
      route = ROUTE.QUARANTINE;
      decision = 'quarantined';
      reason = `Evidence quality ${quality.toFixed(2)} below quarantine threshold ${POLICY_DEFAULTS.maxQuarantineConfidence}.`;
    } else {
      route = ROUTE.FORWARD;
      decision = 'accepted';
      reason = 'Accepted and forwardable.';
    }
    if (route === ROUTE.FORWARD || route === ROUTE.FORWARD_WITH_DEBT) {
      publishClaimAccepted(claim, effectiveStakes);
    }
  } else {
    route = ROUTE.REJECT;
    decision = 'rejected';
    reason = acceptance.reason || 'Rejected by validation gate.';
    publishClaimRejected(claim, reason);
  }

  // Contradiction override: if a high-gap contradiction is detected, may
  // downgrade to quarantine or hold.
  if (consistencyIssues.length && POLICY_DEFAULTS.quarantineOnContradiction) {
    const worst = consistencyIssues.reduce((a, b) => (a.gap > b.gap ? a : b));
    if (worst.gap > POLICY_DEFAULTS.forwardOnContradictionWithGapBelow) {
      if (route === ROUTE.FORWARD) {
        route = ROUTE.HOLD_FOR_HUMAN;
        decision = 'held_for_human';
        reason = `Contradiction detected on subject ${worst.subject} (gap ${worst.gap.toFixed(2)}). Held for human review.`;
      }
      publishContradiction(worst.subject, [claim], worst.gap);
    }
  }

  return Object.freeze({
    route,
    decision,
    reason,
    claim: acceptance.claim || claim,
    acceptance,
    quality,
    calibrated,
    gap,
    stakes: effectiveStakes,
    consistencyIssues,
    debt,
    phase: acceptance.claim ? acceptance.claim._phase : null,
  });
}

// ---------------------------------------------------------------------------
// Batch policy evaluation
// ---------------------------------------------------------------------------

function evaluatePolicyBatch(claims, opts = {}) {
  const stakes = opts.stakes || POLICY_DEFAULTS.stakes;
  const effectiveStakes = maxStakeLevel(Array.isArray(stakes) ? stakes : [stakes]);

  // Consistency check across the whole batch first.
  const consistencyIssues = checkClaimConsistency(claims);
  for (const issue of consistencyIssues) {
    publishContradiction(issue.subject, claims, issue.gap);
  }

  const evaluations = claims.map((c) =>
    evaluatePolicy(c, { ...opts, stakes: effectiveStakes, consistencyIssues }),
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

// ---------------------------------------------------------------------------
// Action selection from policy evaluation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Emission conditions (point 9)
// ---------------------------------------------------------------------------

function canEmit(evaluation) {
  if (evaluation.route === ROUTE.FORWARD || evaluation.route === ROUTE.FORWARD_WITH_DEBT) {
    return { emit: true, route: evaluation.route };
  }
  return { emit: false, route: evaluation.route, reason: evaluation.reason };
}

// ---------------------------------------------------------------------------
// Evidence-before-claims surface (point 9)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Severity escalation for debt (used by stability gates)
// ---------------------------------------------------------------------------

function escalateDebtIfCritical(debt, currentStakes) {
  if (!debt) return debt;
  const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
  const current = severityRank[debt.severity] || 0;
  const stakesRank = { low: 1, normal: 2, high: 3, critical: 4 };
  const stakeVal = stakesRank[currentStakes] || 0;
  if (stakeVal >= 3 && current < 3) {
    return {
      ...debt,
      severity: stakeVal >= 4 ? 'critical' : 'high',
    };
  }
  return debt;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

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
  checkClaimConsistency,
  publishContradiction,
  publishClaimAccepted,
  publishClaimRejected,
  publishDebtCreated,
};
