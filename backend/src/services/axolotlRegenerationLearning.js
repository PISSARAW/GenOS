'use strict';

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

module.exports = { createLearningRecord, evaluateCandidates };
