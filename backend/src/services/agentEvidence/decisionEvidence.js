/**
 * Decision-evidence detection: whether an agent event carries substantiated
 * evidence sufficient to unlock a collective decision.
 */
const { FAILURE_EVENT_TYPES, extractEvidenceReport, isTextItem, hasEvidenceItem } = require('./evidenceHelpers');

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
  const evidence = report.noAnswerProof?.evidence;
  if (!Array.isArray(evidence)) return false;
  for (const item of evidence) {
    if (isTextItem(item)) return true;
  }
  return false;
}

function hasFailureEvidence(event, payload) {
  if (payload.failure || payload.noAnswerProof) return true;
  return FAILURE_EVENT_TYPES.includes(event.eventType);
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
