/**
 * Decision-evidence detection: whether an agent event carries substantiated
 * evidence sufficient to unlock a collective decision.
 */
const { FAILURE_EVENT_TYPES, extractEvidenceReport, hasEvidenceItem, normalizeNoAnswerProof } = require('./evidenceHelpers');

function isSubstantiatedClaim(claim) {
  if (!Array.isArray(claim?.evidence)) return false;
  for (const item of claim.evidence) {
    if (hasEvidenceItem(item)) return true;
  }
  return false;
}

function hasSubstantiatedClaim(report) {
  const claims = Array.isArray(report?.claims) ? report.claims : [];
  for (const claim of claims) {
    if (isSubstantiatedClaim(claim)) return true;
  }
  return false;
}

function hasNoAnswerProof(report) {
  if (report?.outcome !== 'no_answer') return false;
  return Boolean(normalizeNoAnswerProof(report.noAnswerProof || report.no_answer_proof));
}

function hasUsablePayload(payload) {
  return hasEvidenceItem(payload);
}

function hasFailureEvidence(event, payload) {
  const body = payload || {};
  if (hasEvidenceItem(body.failure)) return true;
  const report = extractEvidenceReport(body);
  if (hasNoAnswerProof(report)) return true;
  return FAILURE_EVENT_TYPES.includes(event.eventType) && hasUsablePayload(withoutNoAnswerProof(body));
}

function withoutNoAnswerProof(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { noAnswerProof, no_answer_proof, ...remaining } = value;
  for (const key of ['evidenceReport', 'report']) {
    if (remaining[key] && typeof remaining[key] === 'object') {
      remaining[key] = withoutNoAnswerProof(remaining[key]);
    }
  }
  return remaining;
}

function hasDecisionEvidence(event = {}) {
  const payload = event.payload || {};
  const report = extractEvidenceReport(payload);
  return hasSubstantiatedClaim(report) || hasNoAnswerProof(report) || hasFailureEvidence(event, payload);
}

function decisionEvidenceFailure(event = {}) {
  return `Collective decision blocked: agent event '${event.eventType || 'unknown'}' contains no substantiated evidence.`;
}

module.exports = {
  hasDecisionEvidence,
  decisionEvidenceFailure
};
