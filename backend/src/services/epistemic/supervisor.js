'use strict';

/**
 * Epistemic decision supervisor.
 *
 * Point 6 — decision auditing from evidence, not from polish.
 *
 * Every acceptance decision flows through:
 *  - claim validation (validator.acceptClaim)
 *  - epistemic debt tracking
 *  - trend observation (before/after confidence)
 *  - phase tagging
 *  - contradiction bus (pub/sub, point 11)
 *
 * The supervisor is the single entrypoint for decision stream acceptance.
 */

const {
  acceptClaim,
  acceptClaimBatch,
  checkClaimConsistency,
  reconcileEpistemicDebts,
} = require('./validator');
const { PHASE, tagPhase, phaseOf } = require('./core');
const {
  createEpistemicDebt: createDebt,
  getEpistemicDebts: listDebts,
  getEpistemicDebts,
  createEpistemicDebt,
  resolveEpistemicDebt,
  unresolvedDebtCount,
  evidenceQuality,
  confidenceWithStakes,
  DECAY_CURVES,
  calibrationGap,
  STAKE_LEVELS,
} = require('./core');

// ---------------------------------------------------------------------------
// Observation log: before/after confidence for trend tracking (point 4/5)
// ---------------------------------------------------------------------------

const observationLog = [];

function observeClaim(claim, observation) {
  observationLog.push({
    claimId: claim.id || claim.type,
    subject: claim.subject || null,
    type: claim.type,
    beforeQuality: observation.beforeQuality,
    afterQuality: observation.afterQuality,
    stakes: observation.stakes || STAKE_LEVELS.NORMAL,
    phase: observation.phase || null,
    observedAt: new Date().toISOString(),
  });
  return observationLog[observationLog.length - 1];
}

function lastObservationFor(subject) {
  for (let i = observationLog.length - 1; i >= 0; i--) {
    if (observationLog[i].subject === subject) return observationLog[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Contradiction bus (point 11) — simple pub/sub within the process
// ---------------------------------------------------------------------------

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function unsubscribe(listener) {
  listeners.delete(listener);
}

function publish(contradiction) {
  for (const l of listeners) {
    try {
      l(contradiction);
    } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Supervisor: accept + record — decomposed into pure helpers
// ---------------------------------------------------------------------------

function superviseAccept(claim, opts) {
  if (!opts) opts = {};
  if (!_isClaimValid(claim)) {
    return _buildInvalidResult();
  }

  const context = _buildAcceptContext(opts);
  const result = _runAcceptanceWithStakes(claim, context);
  const acceptedClaim = result.accepted ? claim : null;

  _applyPhaseTag(acceptedClaim, context.phase);

  const afterQuality = _computeAfterQuality(result, acceptedClaim);
  const observation = _recordObservation({
    claim,
    context,
    afterQuality,
  });

  _publishContradictionIssues(result, claim);

  _emitDebtEvents(result, claim);

  return _buildSupervisedResult(result, acceptedClaim, observation);
}

function _isClaimValid(claim) {
  return claim && typeof claim === 'object';
}

function _buildAcceptContext(opts) {
  return {
    stakes: opts.stakes || STAKE_LEVELS.NORMAL,
    phase: opts.phase || null,
    otherOpts: opts,
  };
}

function beforeQualityOf(result) {
  // Extracted for readability; not used directly here but kept for symmetry.
  return 0;
}

function _runAcceptanceWithStakes(claim, context) {
  const stakes = context.stakes;
  const otherOpts = context.otherOpts;
  // Do not spread context.otherOpts directly into acceptClaim to avoid
  // accidentally passing phase twice; phase is removed to avoid duplication.
  const { phase, ...restOpts } = context.otherOpts;
  return acceptClaim(claim, Object.assign({ stakes }, restOpts));
}

function _applyPhaseTag(acceptedClaim, phase) {
  if (acceptedClaim && phase) {
    tagPhase(acceptedClaim, phase);
  }
}

function _computeAfterQuality(result, acceptedClaim) {
  return result.accepted ? evidenceQuality(acceptedClaim) : 0;
}

function _recordObservation(recordOpts) {
  const { claim, context, afterQuality } = recordOpts;
  return observeClaim(claim, {
    beforeQuality: evidenceQuality(claim),
    afterQuality,
    stakes: context.stakes,
    phase: context.phase,
  });
}

function _publishContradictionIssues(result, claim) {
  if (result.accepted && result.claim) {
    const batch = [result.claim];
    const issues = checkClaimConsistency(batch);
    _publishIssues(issues);
  }
}

function _publishIssues(issues) {
  for (const issue of issues) {
    publish({ type: 'contradiction', ...issue, at: new Date().toISOString() });
  }
}

function _emitDebtEvents(result, claim) {
  if (!result.debt || !result.debt.length) return;
  _tryEmitDebtEvents(result.debt, claim);
}

function _tryEmitDebtEvents(debtList, claim) {
  try {
    const telemetry = require('./telemetryObserver');
    for (const d of debtList) {
      telemetry.emitEvent(_debtEventPayload(d, claim));
    }
  } catch (_) {}
}

function _debtEventPayload(d, claim) {
  return {
    eventType: 'EPISTEMIC_DEBT_CREATED',
    agentId: claim.id || 'unknown',
    detail: `Epistemic debt: ${d.reason}`,
    payload: { debtId: d.id, reason: d.reason, severity: d.severity, subject: d.subject },
  };
}

function _buildInvalidResult() {
  return { accepted: false, reason: 'invalid claim', debt: [] };
}

function _buildSupervisedResult(result, acceptedClaim, observation) {
  return {
    accepted: result.accepted,
    claim: acceptedClaim || result.claim,
    validation: result.validation,
    debt: result.debt || [],
    observation,
    reason: result.reason,
  };
}

function superviseAcceptBatch(claims, opts = {}) {
  const stakes = opts.stakes || STAKE_LEVELS.NORMAL;
  const phase = opts.phase || null;

  // Run consistency check up-front across the batch.
  const consistencyIssues = checkClaimConsistency(claims);
  for (const issue of consistencyIssues) {
    publish({ type: 'contradiction', ...issue, at: new Date().toISOString() });
  }

  const results = claims.map((c) => superviseAccept(c, { ...opts, stakes, phase }));
  const accepted = results.filter((r) => r.accepted);
  const rejected = results.filter((r) => !r.accepted);
  const debt = results.reduce((acc, r) => acc.concat(r.debt || []), []);

  return {
    results,
    accepted: accepted.length,
    rejected: rejected.length,
    debtCount: debt.length,
    consistencyIssues,
  };
}

// ---------------------------------------------------------------------------
// Debt reconciliation API
// ---------------------------------------------------------------------------

async function inspectEpistemicState(selector = {}) {
  const debts = await listDebts(selector);
  const [open, resolved] = await Promise.all([
    unresolvedDebtCount({ ...selector, open: true }),
    unresolvedDebtCount({ ...selector, open: false }),
  ]);
  return {
    totalDebts: debts.length,
    open,
    resolved,
    openDebts: debts.filter((d) => !d.resolved),
    resolvedDebts: debts.filter((d) => d.resolved),
  };
}

// ---------------------------------------------------------------------------
// Trend surface (point 4 continued): decay-adjusted confidence over time
// ---------------------------------------------------------------------------

function trendFor(subject, curve = DECAY_CURVES.SHORT) {
  const last = lastObservationFor(subject);
  if (!last) return null;
  const tails = observationLog.filter((o) => o.subject === subject && o.observedAt < last.observedAt).length;
  const decayed = confidenceWithStakes(
    { type: last.type, evidence: [] },
    last.stakes,
    curve,
    tails + 1,
  );
  return {
    subject,
    lastObservation: last.observedAt,
    observedCount: tails + 1,
    lastRawQuality: last.beforeQuality,
    lastCalibrated: last.afterQuality,
    trendedConfidence: decayed,
    curve: curve.label,
  };
}

// ---------------------------------------------------------------------------
// System-wide epistemic audit (point 12 monitoring)
// ---------------------------------------------------------------------------

async function epistemicSystemAudit() {
  const debts = await inspectEpistemicState();
  const policyViolations = [];
  for (const d of debts.openDebts) {
    if (d.severity === 'critical') policyViolations.push({
      kind: 'critical_epistemic_debt',
      debtId: d.id,
      subject: d.subject,
    });
  }
  return {
    timestamp: new Date().toISOString(),
    openDebts: debts.open,
    resolvedDebts: debts.resolved,
    criticalOpen: policyViolations.length,
    policyViolations,
    observationCount: observationLog.length,
  };
}

// ---------------------------------------------------------------------------
// Condition surfaces for decision emission (point 9)
// ---------------------------------------------------------------------------

function shouldForwardClaim(claim, stakes = STAKE_LEVELS.NORMAL) {
  if (!claim || typeof claim !== 'object') return { forward: false, reason: 'invalid claim' };
  const v = require('./validator');
  // Use the acceptance gate to decide forwarding.
  const result = v.acceptClaim(claim, { stakes });
  if (!result.accepted) {
    return { forward: false, reason: result.reason || 'rejected by validation gate' };
  }
  if (result.validation.verdict === v.VERDICT.REQUIRES_DEBT) {
    return { forward: true, debt: true, note: 'forwarded with epistemic debt' };
  }
  if (result.validation.verdict === v.VERDICT.QUARANTINE) {
    return { forward: false, reason: 'quarantined: low evidence quality' };
  }
  return { forward: true };
}

// ---------------------------------------------------------------------------
// Hook surface for stable triggers (point 8)
// ---------------------------------------------------------------------------

const hooks = {
  onDebtCreated: [],
  onContradiction: [],
  onClaimAccepted: [],
  onClaimRejected: [],
};

function onDebtCreated(fn) {
  hooks.onDebtCreated.push(fn);
  return () => { const i = hooks.onDebtCreated.indexOf(fn); if (i >= 0) hooks.onDebtCreated.splice(i, 1); };
}

function onContradiction(fn) {
  hooks.onContradiction.push(fn);
  return () => { const i = hooks.onContradiction.indexOf(fn); if (i >= 0) hooks.onContradiction.splice(i, 1); };
}

function onClaimAccepted(fn) {
  hooks.onClaimAccepted.push(fn);
  return () => { const i = hooks.onClaimAccepted.indexOf(fn); if (i >= 0) hooks.onClaimAccepted.splice(i, 1); };
}

function onClaimRejected(fn) {
  hooks.onClaimRejected.push(fn);
  return () => { const i = hooks.onClaimRejected.indexOf(fn); if (i >= 0) hooks.onClaimRejected.splice(i, 1); };
}

// Internal hook dispatch — used by superviseAccept after validation.
function _emitHooks(claim, supervision) {
  if (supervision.accepted) {
    for (const fn of hooks.onClaimAccepted) {
      try { fn(claim, supervision); } catch (_) {}
    }
  } else {
    for (const fn of hooks.onClaimRejected) {
      try { fn(claim, supervision); } catch (_) {}
    }
  }
  for (const d of (supervision.debt || [])) {
    for (const fn of hooks.onDebtCreated) {
      try { fn(d, claim); } catch (_) {}
    }
  }
}

module.exports = {
  superviseAccept,
  superviseAcceptBatch,
  inspectEpistemicState,
  epistemicSystemAudit,
  trendFor,
  observationLog,
  lastObservationFor,
  observeClaim,
  subscribe,
  unsubscribe,
  publish,
  listeners: () => listeners,
  hooks,
  onDebtCreated,
  onContradiction,
  onClaimAccepted,
  onClaimRejected,
  shouldForwardClaim,
};
