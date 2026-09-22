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
const { computePressure, tierFromPressure } = require('./epistemicHomeostasisService');
const { dissonanceFrom, niveauCorpsent } = require('./epistemicApoptosisService');
const { executeVerifierWorkers } = require('./verifierRuntimeBridge');
const { expandClone, selectWinningClones } = require('./clonalExpansionService');
const { matureStrategy } = require('./affinityMaturationService');
const { depositPheromone } = require('./stigmergyInterProcessBridge');

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

async function immuneSymbiontReview(antigen, context = {}) {
  const pipeline = runAdaptivePipeline(antigen, context);
  const blocked = isImmuneDecisionBlocked(pipeline);
  const blockReason = blocked ? `decision: ${pipeline.decision?.innate?.decision?.action || 'unknown'}` : null;

  const verifiers = pipeline.decision?.assignedVerifiers?.map((v) => ({
    type: v.verifier,
    strategy: v.strategy || [],
    affinity: v.affinity || 0.5,
  })) || [];
  const verifierResults = await executeVerifierWorkers(antigen, verifiers, context);

  const bestVerifier = selectBestVerifier(verifiers);
  const clones = bestVerifier ? expandClone(bestVerifier, { count: 2 }) : [];

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
    pipeline,
    decision: pipeline.decision?.innate?.decision?.action || pipeline.decision?.decision || 'unknown',
    verifierResults,
    clones,
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

async function epistemicHolobionte(antigen, context = {}) {
  const specialist = specialistSymbioteSolve(antigen, context);
  const memory = memorySymbiontLookup(antigen, { ...context, domain: context.domain });
  const immune = await immuneSymbiontReview(antigen, {
    ...context,
    immuneMemory: context.immuneMemory,
    knownSubject: memory.hasMemory,
  });
  const host = hostDecision(
    { specialist, immune, memory },
    { stakes: context.stakes, hostVeto: context.hostVeto },
  );
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
    specialist, immune, memory, biocenose,
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
