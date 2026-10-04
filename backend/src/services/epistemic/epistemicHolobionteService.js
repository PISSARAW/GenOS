'use strict';

const crypto = require('node:crypto');

/**
 * Holobionte épistémique — topologie d'une décision sensible.
 *
 *              Host (orchestrateur)
 *               │
 *       owns final authority
 *               │
 *     ┌─────────┼─────────┐
 *     ▼         ▼         ▼
 * Specialist   Immune    Memory
 *   solver     verifier  known failures
 *     │         │         │
 *     └─────────┼─────────┘
 *               ▼
 *           host veto
 *
 * L'Immune symbiont ne résout pas la tâche. Il cherche :
 *   - toxic evidence
 *   - contradiction
 *   - self-verification
 *   - known failure pattern
 *   - invalid provenance
 *
 * Le Memory symbiont recherche :
 *   - déjà vu ?
 *   - quelle réponse immunitaire fonctionnait ?
 *   - quel verifier avait échoué ?
 *
 * Et le Host garde l'autorité finale.
 */

const { runAdaptivePipeline } = require('./adaptiveImmuneResponse');
const { cognitiveBiocenose, isMonoculture } = require('./epistemicBiocenoseService');
const { recall, fuzzyRecall, recordOutcome } = require('./immuneMemoryService');
const { regulatoryReview } = require('./epistemicInflammationAndRegulation');
const { reArbitrateFromHomeostasis, verifierAssignments } = require('./epistemicHomeostaticArbitration');
const { computePressure, tierFromPressure } = require('./epistemicHomeostasisService');
const { dissonanceFrom, niveauCorpsent } = require('./epistemicApoptosisService');
const { executeVerifierWorkers } = require('./verifierRuntimeBridge');
const { expandClone, selectWinningClones } = require('./clonalExpansionService');
const { matureStrategy } = require('./affinityMaturationService');
const { depositPheromone } = require('./stigmergyInterProcessBridge');
const { applyHomeostaticFeedback, recruitNicheVerifier } = require('./epistemicHomeostaticRearbitration');
const { runProviderMetapopulation } = require('./epistemicProviderMetapopulation');
const { verifyAcrossProviders } = require('./crossProviderVerificationService');
const { recruitAndExecute } = require('./epistemicNicheRecruitmentService');
const { runIsolatedPopulations } = require('./processIsolatedMetapopulationRunner');

function hostDecision(reports, opts = {}) {
  const specialistOutput = reports.specialistOutput || reports.specialist;
  const immuneReport = reports.immuneReport || reports.immune;
  const memoryReport = reports.memoryReport || reports.memory;
  const hostVeto = opts.hostVeto !== false;
  const shouldVeto = Boolean(immuneReport && immuneReport.blocked && !immuneReport.regulatorInhibited && hostVeto);
  if (shouldVeto) {
    return {
      accepted: false,
      reason: `Host veto: ${immuneReport.blockReason}`,
      specialistOutput, immuneReport, memoryReport,
      finalAuthority: 'host',
    };
  }
  return {
    accepted: true,
    reason: immuneReport && immuneReport.blocked
      ? 'Host override: régulateur a inhibé le rejet'
      : 'Host approbation: immune report favorable',
    specialistOutput, immuneReport, memoryReport,
    finalAuthority: 'host',
  };
}

function selectBestVerifier(verifiers) {
  if (!verifiers || verifiers.length === 0) return null;
  return verifiers.reduce((a, b) => (a.affinity >= b.affinity ? a : b));
}

async function depositVerifierPheromone(antigen, verifierResults, verifiers) {
  if (!verifierResults.results || verifierResults.results.length === 0) return;
  const verified = verifierResults.results.filter(r => r.status === 'verified').length;
  const refuted = verifierResults.results.filter(r => r.status === 'refuted').length;

  try {
    await depositPheromone({
      type: refuted > 0 ? 'epistemic_contradiction' : 'epistemic_verifier_success',
      payload: { antigenId: antigen.id, verified, refuted, verifiers: verifiers.map(v => v.type) },
      locus: antigen.id,
      locusHash: antigen.id ? `sha256:${crypto.createHash('sha256').update(antigen.id).digest('hex')}` : null,
      intensity: refuted > 0 ? 0.9 : 0.5,
      isRepellent: refuted > 0,
    }, {});
  } catch (_) { /* stigmergie ne doit pas bloquer */ }
}

function oracleFrom(ctx, antigen) {
  return ctx.oracleTruth || antigen.benchmarkTruth || antigen.oracleTruth || null;
}

function isOracleResolved(oracleTruth) {
  return oracleTruth && typeof oracleTruth === 'object' && 'expectedStatus' in oracleTruth;
}

function applyOracleToClones(clones, cloneResults, oracleTruth) {
  if (!isOracleResolved(oracleTruth)) return;
  for (let i = 0; i < clones.length; i += 1) {
    const clone = clones[i];
    const result = cloneResults.results[i];
    if (!result || result.status === 'error') continue;
    // oracleTruth.expectedStatus doit correspondre au status produit par le verifier.
    // Si le verifier a produit 'verified' et l'oracle attend 'verified', c'est un succès.
    const success = String(result.status) === String(oracleTruth.expectedStatus);
    clone.pending = false;
    clone.usageCount += 1;
    if (success) {
      clone.successes += 1;
    } else {
      clone.failures += 1;
    }
    const total = clone.successes + clone.failures;
    clone.affinity = total > 0 ? clone.successes / total : clone.affinity;
  }
}

function diagnoseWinnerError(oracleTruth, winnerResult) {
  if (!isOracleResolved(oracleTruth) || !winnerResult) return 'incomplete';
  const actual = String(winnerResult.status);
  const expected = String(oracleTruth.expectedStatus);
  if (actual === expected) return 'true_positive';
  // Le verifier a dit 'verified' mais l'oracle dit que c'est faux → false_positive
  if (actual === 'verified' && expected === 'refuted') return 'false_positive';
  // Le verifier a dit 'refuted' mais l'oracle dit que c'est vrai → false_negative
  if (actual === 'refuted' && expected === 'verified') return 'false_negative';
  return 'inconclusive';
}

async function runClonalSelectionCycle(parent, antigen, ctx) {
  const oracleTruth = oracleFrom(ctx, antigen);
  if (!isOracleResolved(oracleTruth)) {
    return { clones: [], selection: null, maturation: null, oracleResolved: false };
  }
  const clones = expandClone(parent, { count: 2 });
  const cloneResults = await executeVerifierWorkers(antigen, clones, ctx);
  applyOracleToClones(clones, cloneResults, oracleTruth);
  const selection = selectWinningClones(parent, clones);
  
  // Calculer le vrai diagnostic de confusion pour piloter la maturation.
  let maturation = null;
  if (oracleTruth && selection?.winner) {
    const winnerResult = cloneResults.results.find(r => r.resultId === selection.winner.id) || cloneResults.results[0];
    const diagnosis = diagnoseWinnerError(oracleTruth, winnerResult);
    maturation = matureStrategy({
      strategy: selection.winner.strategy || [],
      falsePositive: diagnosis === 'false_positive',
      falseNegative: diagnosis === 'false_negative',
      complete: diagnosis === 'true_positive' || diagnosis === 'true_negative',
    }, oracleTruth);
  }
  
  return { clones, cloneResults, selection, maturation, oracleResolved: Boolean(oracleTruth) };
}

async function runReviewIntegrations(antigen, verifiers, context) {
  const crossProvider = context.crossProvider
    ? await verifyAcrossProviders({ ...context.crossProvider, claim: antigen.claim, evidence: antigen.epitopes?.evidence })
    : null;
  const nicheRecruitment = await recruitAndExecute({
    reviewers: verifiers,
    execute: async (candidate) => {
      const execution = await executeVerifierWorkers(antigen, [{ ...candidate, verifier: candidate.type }], context);
      return execution.results?.[0] || null;
    },
  });
  const isolatedPopulations = Array.isArray(context.isolatedPopulations)
    ? await runIsolatedPopulations(context.isolatedPopulations)
    : null;
  return { crossProvider, nicheRecruitment, isolatedPopulations };
}

function reviewBlockState(pipeline, context, integrations) {
  const innateBlocked = isImmuneDecisionBlocked(pipeline);
  const crossProviderBlocked = context.requireCrossProvider === true && integrations.crossProvider?.independent !== true;
  const isolationBlocked = context.requireProcessIsolation === true
    && (!integrations.isolatedPopulations?.length || integrations.isolatedPopulations.some((item) => item.status === 'error'));
  const reason = innateBlocked
    ? `decision: ${pipeline.decision?.innate?.decision?.action || 'unknown'}`
    : crossProviderBlocked ? 'independent provider quorum unavailable'
      : isolationBlocked ? 'process-isolated verifier unavailable' : null;
  return { blocked: innateBlocked || crossProviderBlocked || isolationBlocked, blockReason: reason };
}
async function immuneSymbiontReview(antigen, context = {}) {
  const pipeline = runAdaptivePipeline(antigen, context);
  const initialVerifiers = verifierAssignments(pipeline);
  const initialResults = await executeVerifierWorkers(antigen, initialVerifiers, context);
  const reviewed = await reArbitrateFromHomeostasis({ antigen, context, pipeline, initialVerifiers, firstResults: initialResults });
  const { verifierResults, verifiers } = reviewed;
  const integrations = await runReviewIntegrations(antigen, verifiers, context);
  const { blocked, blockReason } = reviewBlockState(reviewed.pipeline, context, integrations);

  const bestVerifier = selectBestVerifier(verifiers);
  const clonal = bestVerifier
    ? await runClonalSelectionCycle(bestVerifier, antigen, context)
    : { clones: [], selection: null, maturation: null, oracleResolved: false };

  await depositVerifierPheromone(antigen, verifierResults, verifiers);

  const regulator = blockReason
    ? regulatoryReview(antigen, blockReason, {
        immuneMemory: context.immuneMemory || [],
        knownSubject: context.knownSubject,
      })
    : { inhibit: false, reason: 'no rejection to review' };

  return {
    blocked,
    blockReason,
    regulatorInhibited: regulator.inhibit,
    regulatorReason: regulator.reason,
    pipeline: reviewed.pipeline,
    homeostaticFeedback: reviewed.feedback,
    decision: pipeline.decision?.innate?.decision?.action || pipeline.decision?.decision || 'unknown',
    verifierResults,
    ...integrations,
    clones: clonal.clones,
    clonalSelection: clonal.selection,
    affinityMaturation: clonal.maturation,
    oracleResolved: clonal.oracleResolved,
  };
}

function isImmuneDecisionBlocked(pipeline) {
  const innateDecision = pipeline.decision?.innate?.decision || pipeline.decision?.decision || {};
  const action = typeof innateDecision === 'object' ? innateDecision.action : innateDecision;
  return action === 'quarantine' || action === 'quarantaine'
    || action === 'quarantaine_adaptative' || action === 'neutraliser' || action === 'neutralize';
}

function memorySymbiontLookup(antigen, context = {}) {
  const memory = context.immuneMemory || [];
  const direct = recall(memory, antigen);
  const fuzzy = fuzzyRecall(memory, antigen, {
    domain: context.domain,
    threshold: 0.6,
  });

  return {
    directHit: direct,
    fuzzyHits: fuzzy,
    hasMemory: Boolean(direct || fuzzy.length),
    effectiveResponse: direct?.effectiveResponse || (fuzzy[0]?.effectiveResponse || null),
    knownFailurePattern: direct?.pattern || null,
  };
}

function specialistSymbioteSolve(antigen, context = {}) {
  // Le Specialist résout la tâche. Ici on simule un solver qui produit
  // un résultat avec preuve, hypothèses, domaine de validité.
  const claim = antigen.claim || '(no claim)';
  const evidence = antigen.epitopes?.evidence || null;
  const assumptions = antigen.epitopes?.assumptions || [];
  const validityDomain = antigen.epitopes?.validityDomain || null;

  return {
    claim,
    evidence,
    assumptions,
    validityDomain,
    solvedAt: new Date().toISOString(),
  };
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

async function reviewProviders(antigen, context) {
  if (context.multiProviderEnabled !== true) return null;
  return runProviderMetapopulation(antigen, context.providerProfiles || [], {
    runner: context.providerRunner, db: context.db, scopeId: context.scopeId, runId: context.runId,
  });
}

function enforceProviderVeto(host, review) {
  if (!review || (review.status === 'complete' && review.verdict === 'supports')) return host;
  return { ...host, accepted: false,
    reason: `Host veto: multi-provider review ${review.status}/${review.verdict || 'none'}` };
}

async function epistemicHolobionte(antigen, context = {}) {
  const specialist = specialistSymbioteSolve(antigen, context);
  const memory = memorySymbiontLookup(antigen, { ...context, domain: context.domain });
  let immune = await immuneSymbiontReview(antigen, {
    ...context,
    immuneMemory: context.immuneMemory,
    knownSubject: memory.hasMemory,
  });
  const previousVerificationRate = require('./epistemicHomeostaticRearbitration').verificationRate(
    immune.verifierResults?.results || [],
  );
  const recruitment = await recruitNicheVerifier(antigen, immune, { ...context,
    preferredVerifierType: memory.effectiveResponse?.type || memory.effectiveResponse });
  immune = recruitment.immune;
  const feedbackResult = await applyHomeostaticFeedback(antigen, immune, { ...context, previousVerificationRate });
  immune = feedbackResult.immune;
  const providerReview = await reviewProviders(antigen, context);
  const host = enforceProviderVeto(hostDecision(
    { specialist, immune, memory },
    { stakes: context.stakes, hostVeto: context.hostVeto },
  ), providerReview);
  const biocenose = cognitiveBiocenose(
    immune.pipeline?.decision?.assignedVerifiers?.map((v) => ({
      type: v.verifier, niche: v.verifier, strategy: v.strategy,
    })) || [],
  );
  const pressure = computePressure(homeostasisInputFrom(antigen));
  const tier = tierFromPressure(pressure);

  if (context.immuneMemory) {
    recordOutcome(context.immuneMemory, antigen, {
      domain: context.domain,
      outcome: 'pending',
      effectiveResponse: memory.effectiveResponse,
    });
  }

  const dissonance = dissonanceFrom([
    host.accepted ? 0 : 1,
    immune.blocked ? 1 : 0,
    biocenose.isMonoculture ? 0.5 : 0,
  ]);
  const statusLevel = niveauCorpsent(dissonance);

  return {
    accepted: host.accepted,
    reason: host.reason,
    finalAuthority: 'host',
    specialist, immune, memory, biocenose: { ...biocenose, recruited: recruitment.recruited },
    homeostasisFeedback: feedbackResult.feedback, providerReview,
    homeostasis: { pressure, tier },
    epistemicDissonance: dissonance,
    statusLevel,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  hostDecision,
  immuneSymbiontReview,
  memorySymbiontLookup,
  specialistSymbioteSolve,
  epistemicHolobionte,
  expandClone,
  matureStrategy,
  depositPheromone,
};
