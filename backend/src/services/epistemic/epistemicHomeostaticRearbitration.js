'use strict';

const homeostasis = require('./epistemicHomeostasisService');
const biocenose = require('./epistemicBiocenoseService');
const { defaultCatalog, VERIFIER_KINDS } = require('./verifierCatalogService');
const { executeVerifierWorkers } = require('./verifierRuntimeBridge');

const TIER_RANK = Object.freeze({ baseline: 0, lean: 1, adaptive: 2, inflamed: 3, systemic: 4 });

async function applyHomeostaticFeedback(antigen, immune, context = {}) {
  const initialResults = immune.verifierResults?.results || [];
  const pressure = homeostasis.computePressure(homeostasisInput(antigen));
  const previousPressure = Number.isFinite(context.previousPressure) ? context.previousPressure : pressure;
  const evidenceDelta = verificationRate(initialResults);
  const adjustedPressure = homeostasis.feedbackEffect(pressure, previousPressure, evidenceDelta);
  const feedback = { pressure, previousPressure, adjustedPressure,
    tier: homeostasis.tierFromPressure(adjustedPressure), evidenceDelta, rearbitration: null };
  const additional = selectAdditionalVerifier(immune, feedback.tier);
  if (!additional) return { immune, feedback };
  const prior = assignedVerifiers(immune);
  const result = await executeVerifierWorkers(antigen, [additional], { ...context, priorVerifiers: prior });
  return { immune: mergeReview(immune, result, additional), feedback: { ...feedback, rearbitration: { verifier: additional.type, resultCount: result.results.length } } };
}

function homeostasisInput(antigen) {
  return { ...antigen, risk: antigen.risk?.score ?? 0,
    evidence: antigen.epitopes?.evidence ? [antigen.epitopes.evidence] : [],
    validityDomain: antigen.epitopes?.validityDomain, contradictions: antigen.contradictions || [],
    novelty: antigen.novelty || 0, subject: antigen.claim, knownSubjects: antigen.knownSubjects || [],
    budgetRemaining: antigen.budgetRemaining, budgetReference: antigen.budgetReference };
}

function verificationRate(results) {
  if (!results.length) return 0;
  return results.filter((result) => result.status === 'verified').length / results.length;
}

function assignedVerifiers(immune) {
  return (immune.pipeline?.decision?.assignedVerifiers || []).map((entry) => ({
    type: entry.verifier, strategy: entry.strategy || []
  }));
}

function selectAdditionalVerifier(immune, tier) {
  if (TIER_RANK[tier] < TIER_RANK.inflamed || immune.verifierResults?.status === 'verified') return null;
  const used = new Set(assignedVerifiers(immune).map((verifier) => verifier.type));
  const kind = VERIFIER_KINDS.find((candidate) => !used.has(candidate));
  return kind ? { ...defaultCatalog()[kind], niche: kind } : null;
}

function mergeReview(immune, addition, verifier) {
  const results = [...(immune.verifierResults?.results || []), ...addition.results];
  const summary = {
    verified: results.filter((result) => result.status === 'verified').length,
    refuted: results.filter((result) => result.status === 'refuted').length,
    inconclusive: results.filter((result) => result.status === 'inconclusive').length,
    errors: results.filter((result) => result.status === 'error').length,
  };
  const assignedVerifiers = [...(immune.pipeline?.decision?.assignedVerifiers || []), { verifier: verifier.type, strategy: verifier.strategy || [], niche: verifier.niche || verifier.type }];
  const pipeline = { ...immune.pipeline, decision: { ...immune.pipeline?.decision, assignedVerifiers } };
  return { ...immune, pipeline, verifierResults: { status: summary.refuted ? 'refuted' : (summary.verified ? 'verified' : 'inconclusive'), results, summary },
    blocked: immune.blocked || summary.refuted > 0,
    blockReason: summary.refuted ? 'homeostatic rearbitration produced a refuting verifier result' : immune.blockReason,
    rearbitrationVerifier: verifier.type };
}

function verifierDiversity(immune) {
  const reviewers = assignedVerifiers(immune).map((verifier) => ({ type: verifier.type, niche: verifier.type, strategy: verifier.strategy }));
  const measured = biocenose.cognitiveBiocenose(reviewers);
  return { ...measured, recruited: measured.shouldRecruit ? measured.recommendNiche : null };
}

async function recruitNicheVerifier(antigen, immune, context = {}) {
  const diversity = verifierDiversity(immune);
  if (!diversity.shouldRecruit) return { immune, diversity, recruited: null };
  const kind = VERIFIER_KINDS.includes(diversity.recommendNiche) ? diversity.recommendNiche
    : VERIFIER_KINDS.find((candidate) => !assignedVerifiers(immune).some((verifier) => verifier.type === candidate));
  if (!kind) return { immune, diversity, recruited: null };
  const verifier = { ...defaultCatalog()[kind], niche: kind };
  const prior = assignedVerifiers(immune);
  const result = await executeVerifierWorkers(antigen, [verifier], { ...context, priorVerifiers: prior });
  return { immune: mergeReview(immune, result, verifier), diversity: { ...diversity, recruited: kind }, recruited: kind };
}

module.exports = { applyHomeostaticFeedback, verifierDiversity, recruitNicheVerifier, homeostasisInput };
