/**
 * Evidence scoring: converts a worker evidence payload into a 0-100 score, or
 * null when the payload carries no evidence signal at all (so callers do not
 * fabricate a zero and overwrite a previously good score).
 */
const {
  FAILURE_EVENT_TYPES,
  hasEvidenceItem,
  isTextItem,
  boundedScore,
  boundedEvidenceScore
} = require('./evidenceHelpers');

const RUBRIC_WEIGHTS = { craft: 0.25, coherence: 0.2, original: 0.2, emotionalImpact: 0.15, constraintCoverage: 0.2 };

function isExplicitFailure(payload, report) {
  if (payload.failure || report.outcome === 'failed') return true;
  return FAILURE_EVENT_TYPES.includes(payload.eventType);
}

function countNoAnswerEvidence(report) {
  if (report.outcome !== 'no_answer') return 0;
  const evidence = report.noAnswerProof?.evidence;
  if (!Array.isArray(evidence)) return 0;
  return evidence.filter(isTextItem).length;
}

function isCreative(report, context) {
  if (report.artifact === 'creative') return true;
  if (context.artifact === 'creative') return true;
  return /author|literary|dramaturg|creative/i.test(context.role || '');
}

function reportCarriesSignal(report) {
  if (report.noAnswerProof !== undefined) return true;
  if (Array.isArray(report.uncertainties) && report.uncertainties.length > 0) return true;
  if (Array.isArray(report.tests) && report.tests.length > 0) return true;
  return false;
}

function claimEvidence(claim) {
  if (!Array.isArray(claim?.evidence)) return [];
  return claim.evidence.filter(hasEvidenceItem);
}

function sumClaimEvidence(count, claim) {
  const evidence = claimEvidence(claim);
  return count + evidence.length * 10 + (evidence.length > 0 ? 2 : 0);
}

function uncertaintyPenalty(report, weight) {
  return Array.isArray(report.uncertainties) ? report.uncertainties.length * weight : 0;
}

function nonCreativeScore(report, claims) {
  const score = claims.reduce(sumClaimEvidence, 0);
  return score - uncertaintyPenalty(report, 3);
}

function weightedRubricScore(rubric) {
  let total = 0;
  for (const [key, weight] of Object.entries(RUBRIC_WEIGHTS)) total += boundedScore(rubric[key]) * weight;
  return total * 100;
}

function cappedCount(list, perItem, cap) {
  return Array.isArray(list) ? Math.min(cap, list.length * perItem) : 0;
}

function artifactScore(report) {
  return typeof report.artifactText === 'string' && report.artifactText.trim() ? 10 : 0;
}

function creativeScore(report) {
  const evaluation = report.creativeEvaluation || {};
  const rubric = evaluation.rubric || report.rubric || {};
  // Producers send `originality`, the weight table reads `original`: accept
  // the alias so originality is never silently scored 0.
  const normalized = rubric.original === undefined && rubric.originality !== undefined
    ? { ...rubric, original: rubric.originality }
    : rubric;
  // constraintCoverage is scored separately below: exclude it from the
  // weighted rubric so it is never counted twice.
  const rubricScore = weightedRubricScore({ ...normalized, constraintCoverage: 0 });
  const constraintCoverage = boundedScore(evaluation.constraintCoverage ?? normalized.constraintCoverage) * 20;
  const revisionEvidence = cappedCount(evaluation.revisions, 2, 10);
  const independentCritique = cappedCount(evaluation.criticEvidence, 2, 10);
  return rubricScore + constraintCoverage + revisionEvidence + independentCritique + artifactScore(report)
    - uncertaintyPenalty(report, 2);
}

function hasNoEvidenceSignal(state) {
  if (state.claims.length > 0 || state.noAnswerEvidence > 0 || state.creative) return false;
  return !reportCarriesSignal(state.report);
}

function evidenceScore(payload = {}, context = {}) {
  const report = payload.evidenceReport || payload.report || {};
  if (isExplicitFailure(payload, report)) return 0;
  const claims = Array.isArray(report.claims) ? report.claims : [];
  const noAnswerEvidence = countNoAnswerEvidence(report);
  const creative = isCreative(report, context);
  if (hasNoEvidenceSignal({ report, claims, noAnswerEvidence, creative })) return null;
  if (noAnswerEvidence > 0 && claims.length === 0) {
    return boundedEvidenceScore(Math.min(100, 25 + noAnswerEvidence * 10));
  }
  if (!creative) return boundedEvidenceScore(nonCreativeScore(report, claims));
  return boundedEvidenceScore(creativeScore(report));
}

module.exports = { evidenceScore };
