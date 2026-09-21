'use strict';

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

function hostDecision(reports, opts = {}) {
  const { specialistOutput, immuneReport, memoryReport } = reports;
  const stakes = opts.stakes || 'normal';
  const hostVeto = opts.hostVeto !== false;

  // Le Host rejoute si l'Immune symbiont bloque et que le régulateur n'a pas inhibé.
  if (immuneReport.blocked && !immuneReport.regulatorInhibited && hostVeto) {
    return {
      accepted: false,
      reason: `Host veto: ${immuneReport.blockReason}`,
      specialistOutput,
      immuneReport,
      memoryReport,
      finalAuthority: 'host',
    };
  }

  // Le Host accepte si l'Immune approuve OU si le régulateur inhibe le rejet.
  return {
    accepted: true,
    reason: immuneReport.blocked
      ? 'Host override: régulateur a inhibé le rejet'
      : 'Host approbation: immune report favorable',
    specialistOutput,
    immuneReport,
    memoryReport,
    finalAuthority: 'host',
  };
}

function immuneSymbiontReview(antigen, context = {}) {
  const pipeline = runAdaptivePipeline(antigen, context);
  const decision = pipeline.decision;
  const blocked = decision === 'quarantaine' || decision === 'quarantaine_adaptative';
  const blockReason = blocked ? `decision: ${decision}` : null;

  // Régulateur T-reg : vérifie que le système ne rejette pas pour une mauvaise raison.
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
    decision,
  };
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

function epistemicHolobionte(antigen, context = {}) {
  // 1. Specialist résout.
  const specialist = specialistSymbioteSolve(antigen, context);

  // 2. Memory cherche les échecs connus.
  const memory = memorySymbiontLookup(antigen, {
    ...context,
    domain: context.domain,
  });

  // 3. Immune vérifie.
  const immune = immuneSymbiontReview(antigen, {
    ...context,
    immuneMemory: context.immuneMemory,
    knownSubject: memory.hasMemory,
  });

  // 4. Host arbitre.
  const host = hostDecision(
    { specialistOutput: specialist, immuneReport: immune, memoryReport: memory },
    { stakes: context.stakes, hostVeto: context.hostVeto },
  );

  // 5. Biocénose : mesure la diversité des vérificateurs.
  const biocenose = cognitiveBiocenose(
    immune.pipeline?.decision?.assignedVerifiers?.map((v) => ({
      type: v.verifier,
      niche: v.verifier,
      strategy: v.strategy,
    })) || [],
  );

  // 6. Pression homéostatique.
  const pressure = computePressure(antigen);
  const tier = tierFromPressure(pressure);

  // 7. Mise à jour de la mémoire (affinity maturation).
  if (context.immuneMemory) {
    recordOutcome(context.immuneMemory, antigen, {
      domain: context.domain,
      success: host.accepted,
      effectiveResponse: memory.effectiveResponse,
    });
  }

  // 8. Dissonance épistémique (apoptose).
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
    specialist,
    immune,
    memory,
    biocenose,
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
};
