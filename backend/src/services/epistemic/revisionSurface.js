'use strict';

/**
 * Revision-immediate surface.
 *
 * Point 8 — revise immediately when premise changes.
 *
 * Every accepted claim can be revised on the spot when:
 *  - new evidence arrives that changes quality above the threshold
 *  - a contradiction is detected that affects the claim's subject
 *  - a debt is resolved or escalated
 *
 * The surface exposes requestRevision + reasoning hooks (why was it cited,
 * what changed, what evidence corrected it).
 */

const {
  evidenceQuality,
  confidenceWithStakes,
  STAKE_LEVELS,
  DECAY_CURVES,
  createEpistemicDebt,
  getEpistemicDebts,
  resolveEpistemicDebt,
} = require('./core');
const {
  superviseAccept,
  subscribe: busSubscribe,
  publish: busPublish,
  checkClaimConsistency,
  PHASE,
} = require('./supervisor');

// ---------------------------------------------------------------------------
// Reasoning snapshot for "why was this cited"
// ---------------------------------------------------------------------------

function reasoningSnapshot(claim, context = {}) {
  return Object.freeze({
    claimId: claim.id || claim.type,
    subject: claim.subject || null,
    statement: claim.statement || null,
    quality: evidenceQuality(claim),
    stakes: context.stakes || STAKE_LEVELS.NORMAL,
    phase: claim._phase || null,
    citedBy: context.citedBy || [],
    reasons: context.reasons || [],
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Revision request
// ---------------------------------------------------------------------------

function requestRevision(originalClaim, revised, reason, opts = {}) {
  if (!originalClaim || !revised) return null;
  const stakes = opts.stakes || STAKE_LEVELS.NORMAL;

  const beforeQuality = evidenceQuality(originalClaim);
  const afterQuality = evidenceQuality(revised);

  // Revision is meaningful only if quality changes meaningfully.
  const delta = Math.abs(afterQuality - beforeQuality);
  if (delta < 0.05 && !reason) {
    return {
      revised: false,
      reason: 'No meaningful quality change and no explicit reason provided.',
    };
  }

  const result = superviseAccept(revised, { stakes, phase: PHASE.COMMIT });
  const snapshot = reasoningSnapshot(revised, {
    stakes,
    citedBy: [reason],
    reasons: [reason],
  });

  // Emit a revision event on the contradiction bus if the subject is affected.
  if (result.accepted && revised.subject) {
    busPublish({
      type: 'claim_revised',
      claimId: revised.id || revised.type,
      subject: revised.subject,
      beforeQuality,
      afterQuality,
      delta,
      reason,
      at: new Date().toISOString(),
    });
  }

  // If revision lowers quality significantly, mark as debt if it was accepted.
  if (result.accepted && afterQuality < beforeQuality - 0.1 && result.debt.length === 0) {
    const debt = createEpistemicDebt({
      reason: 'revision_lowered_quality',
      subject: revised.subject || revised.id,
      claimType: revised.type,
      description: `Revision lowered evidence quality from ${beforeQuality.toFixed(2)} to ${afterQuality.toFixed(2)}.`,
      severity: 'medium',
    });
    result.debt.push(debt);
  }

  return Object.freeze({
    revised: result.accepted,
    original: originalClaim,
    revised: revised,
    beforeQuality,
    afterQuality,
    delta,
    debt: result.debt || [],
    snapshot,
    reason,
  });
}

// ---------------------------------------------------------------------------
// Revise on contradiction resolution
// ---------------------------------------------------------------------------

async function reviseClaimsOnContradiction(subject, contradiction) {
  const debts = await getEpistemicDebts({ subject });
  const revised = [];
  for (const d of debts) {
    if (d.resolved) continue;
    // Attempt to resolve debt by revision: re-evaluate any claim tied to this
    // subject. For now we just resolve the debt with a note; full re-evaluation
    // requires the original claim to be present.
    const resolved = resolveEpistemicDebt(d.id, `Contradiction resolved: ${contradiction ? contradiction.type : 'unknown'}.`);
    if (resolved) revised.push(resolved);
  }
  return revised;
}

// ---------------------------------------------------------------------------
// Batch revision when new evidence arrives
// ---------------------------------------------------------------------------

function batchReviseOnEvidence(subject, newEvidenceKind, newEvidence) {
  // Find claims touching this subject and re-validate.
  // In a full implementation this would query the evidence_claims table.
  // Here we return a stub that can be wired to a store.
  return {
    subject,
    evidenceKind: newEvidenceKind,
    action: 'batch_revise_stub',
    note: 'Wire to evidence_claims query + re-run superviseAccept per claim.',
  };
}

// ---------------------------------------------------------------------------
// Reasoning hooks surface
// ---------------------------------------------------------------------------

const revisionHooks = {
  beforeRevision: [],
  afterRevision: [],
  onQualityDrop: [],
};

function onBeforeRevision(fn) {
  revisionHooks.beforeRevision.push(fn);
  return () => {
    const i = revisionHooks.beforeRevision.indexOf(fn);
    if (i >= 0) revisionHooks.beforeRevision.splice(i, 1);
  };
}

function onAfterRevision(fn) {
  revisionHooks.afterRevision.push(fn);
  return () => {
    const i = revisionHooks.afterRevision.indexOf(fn);
    if (i >= 0) revisionHooks.afterRevision.splice(i, 1);
  };
}

function onQualityDrop(fn) {
  revisionHooks.onQualityDrop.push(fn);
  return () => {
    const i = revisionHooks.onQualityDrop.indexOf(fn);
    if (i >= 0) revisionHooks.onQualityDrop.splice(i, 1);
  };
}

function emitRevision(revision) {
  if (!revision || !revision.revised) return;
  for (const fn of revisionHooks.afterRevision) {
    try { fn(revision); } catch (_) {}
  }
  if (revision.delta > 0 && revision.afterQuality < revision.beforeQuality) {
    for (const fn of revisionHooks.onQualityDrop) {
      try { fn(revision); } catch (_) {}
    }
  }
}

// Patch requestRevision to emit hooks.
const _originalRequestRevision = requestRevision;
function requestRevisionWithHooks(originalClaim, revised, reason, opts) {
  const revision = _originalRequestRevision(originalClaim, revised, reason, opts);
  emitRevision(revision);
  return revision;
}

module.exports = {
  reasoningSnapshot,
  requestRevision: requestRevisionWithHooks,
  reviseClaimsOnContradiction,
  batchReviseOnEvidence,
  revisionHooks,
  onBeforeRevision,
  onAfterRevision,
  onQualityDrop,
};
