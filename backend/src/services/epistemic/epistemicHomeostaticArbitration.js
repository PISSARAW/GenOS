'use strict';

const { runAdaptivePipeline } = require('./adaptiveImmuneResponse');
const { computePressure, tierFromPressure, feedbackEffect } = require('./epistemicHomeostasisService');
const { executeVerifierWorkers } = require('./verifierRuntimeBridge');
const { priorExecutedVerifiers } = require('./epistemicHomeostaticRearbitration');
const { isConfirmedExecution } = require('./verifierEvidence');

function verifierEvidenceScore(verifierResults) {
  const results = verifierResults.results || [];
  if (!results.length) return 0;
  const verified = results.filter((item) => item.status === 'verified' && isConfirmedExecution(item)).length;
  const refuted = results.filter((item) => item.status === 'refuted' && isConfirmedExecution(item)).length;
  const resolved = verified + refuted;
  const completion = resolved / results.length;
  const agreement = resolved ? Math.max(verified, refuted) / resolved : 0;
  return completion * (0.6 + 0.4 * agreement);
}

function homeostaticVerifierFeedback(antigen, verifierResults) {
  const input = homeostasisInputFrom(antigen);
  const initialPressure = computePressure(input);
  const evidenceScore = verifierEvidenceScore(verifierResults);
  const outcomes = verifierResults.results || [];
  const mixed = outcomes.some((item) => item.status === 'verified')
    && outcomes.some((item) => item.status === 'refuted');
  const measuredPressure = computePressure({
    ...input,
    evidence: [{ quality: evidenceScore }],
    contradictions: mixed ? [...input.contradictions, { weight: 0.5 }] : input.contradictions,
  });
  const pressure = Math.max(0, Math.min(1, feedbackEffect(measuredPressure, initialPressure, evidenceScore)));
  return { initialPressure, measuredPressure, pressure, evidenceScore, tier: tierFromPressure(pressure) };
}

function homeostasisInputFrom(antigen) {
  return {
    ...antigen,
    risk: antigen.risk?.score !== undefined ? antigen.risk.score : 0,
    evidence: antigen.epitopes?.evidence ? [antigen.epitopes.evidence] : [],
    validityDomain: antigen.epitopes?.validityDomain,
    contradictions: antigen.contradictions || [],
    novelty: antigen.novelty || 0,
    subject: antigen.claim,
    knownSubjects: antigen.knownSubjects || [],
    budgetRemaining: antigen.budgetRemaining,
    budgetReference: antigen.budgetReference,
  };
}

function verifierAssignments(pipeline) {
  return pipeline.decision?.assignedVerifiers?.map((verifier) => ({
    type: verifier.verifier,
    strategy: verifier.strategy || [],
    affinity: verifier.affinity || 0.5,
  })) || [];
}

function mergeVerifierResults(first, additional) {
  const results = [...(first.results || []), ...(additional.results || [])];
  const summary = {
    verified: results.filter((item) => item.status === 'verified').length,
    refuted: results.filter((item) => item.status === 'refuted').length,
    inconclusive: results.filter((item) => item.status === 'inconclusive').length,
    errors: results.filter((item) => item.status === 'error').length,
  };
  return { status: summary.refuted ? 'refuted' : summary.verified ? 'verified' : 'inconclusive', results, summary };
}

async function reArbitrateFromHomeostasis({ antigen, context, pipeline, initialVerifiers, firstResults }) {
  const feedback = homeostaticVerifierFeedback(antigen, firstResults);
  const desiredCount = Math.min(4, Math.max(initialVerifiers.length, Math.ceil(feedback.pressure * 4)));
  if (desiredCount <= initialVerifiers.length) {
    return { pipeline, verifiers: initialVerifiers, verifierResults: firstResults,
      feedback: { ...feedback, reArbitrated: false, addedVerifiers: [] } };
  }
  const failedTypes = new Set();
  (firstResults.results || []).forEach((item, index) => {
    if (item.status === 'error' && initialVerifiers[index]) failedTypes.add(initialVerifiers[index].type);
  });
  const secondPipeline = runAdaptivePipeline(antigen, {
    ...context,
    cloneCount: desiredCount,
    strategyBias: (type) => (failedTypes.has(type) ? 0.25 : 1) * (context.strategyBias ? context.strategyBias(type) : 1),
  });
  const priorTypes = new Set(initialVerifiers.map((item) => item.type));
  const additional = verifierAssignments(secondPipeline).filter((item) => !priorTypes.has(item.type));
  const prior = priorExecutedVerifiers({ verifierResults: firstResults });
  const additionalResults = await executeVerifierWorkers(antigen, additional, {
    ...context, priorVerifiers: [...(context.priorVerifiers || []), ...prior],
  });
  const assignedVerifiers = [...initialVerifiers, ...additional].map((item) => ({
    verifier: item.type, strategy: item.strategy, affinity: item.affinity,
  }));
  return {
    pipeline: { ...secondPipeline, decision: { ...secondPipeline.decision, assignedVerifiers } },
    verifiers: [...initialVerifiers, ...additional],
    verifierResults: mergeVerifierResults(firstResults, additionalResults),
    feedback: { ...feedback, reArbitrated: additional.length > 0, addedVerifiers: additional.map((item) => item.type) },
  };
}

module.exports = { homeostaticVerifierFeedback, reArbitrateFromHomeostasis, verifierAssignments };
