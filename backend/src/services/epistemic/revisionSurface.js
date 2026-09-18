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
} = require('./supervisor');
const { PHASE } = require('./core');

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

function revisionContext(context) {
  if (typeof context === 'string') return { reason: context };
  return context || {};
}

function revisionIsMeaningful(beforeQuality, afterQuality, reason) {
  return Math.abs(afterQuality - beforeQuality) >= 0.05 || Boolean(reason);
}

function publishRevision(revised, quality, reason) {
  if (!revised.subject) return;
  busPublish({
    type: 'claim_revised', claimId: revised.id || revised.type, subject: revised.subject,
    beforeQuality: quality.before, afterQuality: quality.after, delta: quality.delta,
    reason, at: new Date().toISOString(),
  });
}

function addRevisionDebt(result, revised, quality) {
  if (!result.accepted || quality.after >= quality.before - 0.1 || result.debt.length) return;
  result.debt.push(createEpistemicDebt({
    reason: 'revision_lowered_quality', subject: revised.subject || revised.id,
    claimType: revised.type,
    description: `Revision lowered evidence quality from ${quality.before.toFixed(2)} to ${quality.after.toFixed(2)}.`,
    severity: 'medium',
  }));
}

function requestRevision(originalClaim, revised, context = {}) {
  if (!originalClaim || !revised) return null;
  const opts = revisionContext(context);
  const reason = opts.reason;
  const stakes = opts.stakes || STAKE_LEVELS.NORMAL;

  const beforeQuality = evidenceQuality(originalClaim);
  const afterQuality = evidenceQuality(revised);

  // Revision is meaningful only if quality changes meaningfully.
  const delta = Math.abs(afterQuality - beforeQuality);
  if (!revisionIsMeaningful(beforeQuality, afterQuality, reason)) {
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

  publishRevision(revised, { before: beforeQuality, after: afterQuality, delta }, reason);
  addRevisionDebt(result, revised, { before: beforeQuality, after: afterQuality });

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

async function batchReviseOnEvidence(subject, newEvidenceKind, newEvidence) {
  // Find claims touching this subject and re-validate.
  // In a full implementation this would query the evidence_claims table.
  if (!revisionStore) return { revised: false, status: 'store_unavailable', subject };
  const rows = await revisionStore.all('SELECT id, claim_json FROM epistemic_claims WHERE subject = ? AND status = \'active\'', subject);
  const evidence = { kind: newEvidenceKind, ...newEvidence };
  const revisions = [];
  for (const row of rows) {
    const original = JSON.parse(row.claim_json);
    const revised = { ...original, evidence: [...(original.evidence || []), evidence] };
    revisions.push(requestRevisionWithHooks(original, revised, { reason: 'new_evidence' }));
    await persistClaim(revised);
  }
  return { revised: true, status: 'completed', subject, evidenceKind: newEvidenceKind, count: revisions.length, revisions };
}

// ---------------------------------------------------------------------------
// Reasoning hooks surface
// ---------------------------------------------------------------------------

const revisionHooks = {
  beforeRevision: [],
  afterRevision: [],
  onQualityDrop: [],
};

let revisionStore = null;

function configureRevisionStore(db) {
  revisionStore = db || null;
}

async function persistClaim(claim) {
  if (!revisionStore || !claim?.id) return;
  await revisionStore.run(
    `INSERT INTO epistemic_claims (id, subject, claim_json, quality, status, updated_at)
     VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET subject = excluded.subject, claim_json = excluded.claim_json,
       quality = excluded.quality, status = 'active', updated_at = CURRENT_TIMESTAMP`,
    claim.id, claim.subject || null, JSON.stringify(claim), evidenceQuality(claim)
  );
}

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
function requestRevisionWithHooks(originalClaim, revised, context) {
  const revision = _originalRequestRevision(originalClaim, revised, context);
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
  configureRevisionStore,
  persistClaim,
};
