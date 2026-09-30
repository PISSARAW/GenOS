'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../db');

/**
 * Keeps cognitive regeneration experiments attached to an Axolotl session.
 * Candidate knowledge is never promoted by this module.
 */
function createLearningRecord(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  return {
    status: candidates.length ? 'proposed' : 'not_requested',
    candidates: candidates.map((candidate, index) => ({
      id: String(candidate.id || `candidate_${index + 1}`),
      kind: String(candidate.kind || 'knowledge'),
      content: candidate.content,
      sourceRefs: Array.isArray(candidate.sourceRefs) ? candidate.sourceRefs : [],
      status: 'proposed',
      evidence: []
    }))
  };
}

async function evaluateCandidates(record, evaluator) {
  if (!record || record.candidates.length === 0) return record;
  if (typeof evaluator !== 'function') return { ...record, status: 'awaiting_evaluator' };
  const candidates = [];
  for (const candidate of record.candidates) {
    const outcome = await evaluator({ ...candidate });
    candidates.push(attachOutcome(candidate, outcome));
  }
  return { status: 'evaluated', candidates };
}

function attachOutcome(candidate, outcome) {
  const valid = Boolean(outcome && outcome.passed === true && Array.isArray(outcome.evidenceRefs) && outcome.evidenceRefs.length);
  return {
    ...candidate,
    status: valid ? 'supported_candidate' : 'rejected_candidate',
    evidence: valid ? outcome.evidenceRefs.map(String) : [],
    reason: valid ? null : String(outcome?.reason || 'Évaluation sans preuve recevable.')
  };
}

function matchesVerifiedEvidence(result, refs) {
  const verified = new Set(result?.verifiedRefs || []);
  return result?.valid === true && refs.length > 0 && refs.every((ref) => verified.has(ref));
}

function promotionDetails(candidate) {
  const value = candidate.content && typeof candidate.content === 'object' ? candidate.content : {};
  return {
    name: String(value.traitName || value.name || candidate.id).slice(0, 120),
    description: String(value.description || (typeof candidate.content === 'string' ? candidate.content : '')).slice(0, 4000),
    tags: Array.isArray(value.tags) ? value.tags.map(String).slice(0, 32) : []
  };
}

function promotionPreconditionFailure({ candidate, refs, db, evidenceVerifier }) {
  if (candidate?.status !== 'supported_candidate' || !refs.length) return 'COGNITIVE_CANDIDATE_UNSUPPORTED';
  if (!db || typeof evidenceVerifier !== 'function') return 'COGNITIVE_EVIDENCE_VERIFIER_REQUIRED';
  return null;
}

async function promoteCandidate({ candidate, sessionId, sourceAgentId, db, evidenceVerifier }) {
  const refs = candidate?.evidence || [];
  const precondition = promotionPreconditionFailure({ candidate, refs, db, evidenceVerifier });
  if (precondition) return { success: false, code: precondition };
  const verification = await evidenceVerifier({ db, evidenceRefs: refs, sessionId, candidateId: candidate.id });
  if (!matchesVerifiedEvidence(verification, refs)) return { success: false, code: 'COGNITIVE_EVIDENCE_REJECTED' };
  const details = promotionDetails(candidate);
  if (!details.description) return { success: false, code: 'COGNITIVE_CANDIDATE_EMPTY' };
  const traitId = `axolotl_trait_${crypto.randomUUID()}`;
  await withTransaction(db, (tx) => tx.run(
    `INSERT INTO learned_traits (id, trait_name, trait_description, source_agent_id, context_id, trait_data_json, promotion_level, confidence, usage_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0.5, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    traitId, details.name, details.description, sourceAgentId || null, sessionId,
    JSON.stringify({ kind: 'axolotl_regeneration_candidate', candidateId: candidate.id, evidenceRefs: refs, verifierReceipt: verification.receiptId || null, tags: details.tags })
  ));
  return { success: true, traitId, promotionLevel: 0, evidenceRefs: refs, receiptId: verification.receiptId || null };
}

module.exports = { createLearningRecord, evaluateCandidates, promoteCandidate };
