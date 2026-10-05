'use strict';

const homeostasis = require('./epistemicHomeostasisService');
const biocenose = require('./epistemicBiocenoseService');
const { defaultCatalog, VERIFIER_KINDS } = require('./verifierCatalogService');
const { executeVerifierWorkers } = require('./verifierRuntimeBridge');
const { isConfirmedExecution } = require('./verifierEvidence');

const TIER_RANK = Object.freeze({ baseline: 0, lean: 1, adaptive: 2, inflamed: 3, systemic: 4 });

async function applyHomeostaticFeedback(antigen, immune, context = {}) {
  const initialResults = immune.verifierResults?.results || [];
  const pressure = homeostasis.computePressure(homeostasisInput(antigen));
  const previousPressure = Number.isFinite(context.previousPressure) ? context.previousPressure : pressure;
  const previousRate = Number.isFinite(context.previousVerificationRate) ? context.previousVerificationRate : verificationRate(initialResults);
  const evidenceDelta = verificationRate(initialResults) - previousRate;
  const adjustedPressure = homeostasis.feedbackEffect(pressure, previousPressure, evidenceDelta);
  const feedback = { pressure, previousPressure, adjustedPressure,
    tier: homeostasis.tierFromPressure(adjustedPressure), evidenceDelta,
    previousVerificationRate: previousRate, verificationRate: verificationRate(initialResults),
    rearbitration: null };
  if (context.verifierBudget && context.verifierBudget.remaining <= 0) return { immune, feedback };
  const additional = selectAdditionalVerifier(immune, feedback.tier);
  if (!additional) return { immune, feedback };
  const prior = priorExecutedVerifiers(immune);
  const result = await executeVerifierWorkers(antigen, [additional], { ...context, priorVerifiers: prior });
  const merged = mergeReview(immune, result, additional);
  return { immune: merged, feedback: { ...feedback,
    rearbitration: { verifier: additional.type, resultCount: result.results.length,
      verificationRate: verificationRate(merged.verifierResults.results),
      budgetRemaining: context.verifierBudget?.remaining ?? null } } };
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
  return results.filter((result) => result.status === 'verified' && isConfirmedExecution(result)).length / results.length;
}

function assignedVerifiers(immune) {
  return (immune.pipeline?.decision?.assignedVerifiers || []).map((entry) => ({
    type: entry.verifier, strategy: entry.strategy || []
  }));
}

function priorExecutedVerifiers(immune) {
  return (immune.verifierResults?.results || []).filter((row) => row.receipt).map((row) => ({
    ...row.receipt.independenceDescriptor,
    type: row.verifierType, executionWorkspace: row.receipt.independenceDescriptor?.workspaceId,
    strategy: row.receipt.independenceDescriptor?.strategy?.split(',') || [],
  }));
}

function selectAdditionalVerifier(immune, tier) {
  if (TIER_RANK[tier] < TIER_RANK.inflamed || hasIndependentQuorum(immune)) return null;
  const used = new Set(assignedVerifiers(immune).map((verifier) => verifier.type));
  const kind = VERIFIER_KINDS.find((candidate) => !used.has(candidate));
  return kind ? { ...defaultCatalog()[kind], niche: kind } : null;
}

function hasIndependentQuorum(immune) {
  const workspaces = (immune.verifierResults?.results || []).filter((row) => row.status === 'verified'
    && isConfirmedExecution(row)).map((row) => row.receipt.independenceDescriptor?.workspaceId);
  return new Set(workspaces.filter(Boolean)).size >= 2;
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
  const reviewers = (immune.verifierResults?.results || []).filter((row) => row.receipt).map((row) => ({
    type: row.verifierType, niche: row.verifierType,
    strategy: row.receipt?.independenceDescriptor?.strategy || row.verifierType,
    provider: row.receipt?.independenceDescriptor?.model || 'unknown',
    tools: (row.receipt?.executionEvidence || []).map((item) => item.commandHash),
    errorPatterns: row.counterexamples?.map((item) => item.type) || [],
  }));
  const measured = biocenose.cognitiveBiocenose(reviewers);
  return { ...measured, recruited: measured.shouldRecruit ? measured.recommendNiche : null };
}

async function recruitNicheVerifier(antigen, immune, context = {}) {
  const diversity = verifierDiversity(immune);
  if (!diversity.shouldRecruit || hasIndependentQuorum(immune) || context.verifierBudget?.remaining === 0) {
    return { immune, diversity, recruited: null };
  }
  const used = new Set(assignedVerifiers(immune).map((verifier) => verifier.type));
  const preferred = context.preferredVerifierType;
  const kind = VERIFIER_KINDS.includes(preferred) && !used.has(preferred) ? preferred
    : VERIFIER_KINDS.find((candidate) => !used.has(candidate));
  if (!kind) return { immune, diversity, recruited: null };
  const verifier = { ...defaultCatalog()[kind], niche: kind };
  const prior = priorExecutedVerifiers(immune);
  const result = await executeVerifierWorkers(antigen, [verifier], { ...context, priorVerifiers: prior });
  return { immune: mergeReview(immune, result, verifier), diversity: { ...diversity, recruited: kind }, recruited: kind };
}

module.exports = { applyHomeostaticFeedback, verifierDiversity, recruitNicheVerifier,
  homeostasisInput, verificationRate, priorExecutedVerifiers, hasIndependentQuorum };
