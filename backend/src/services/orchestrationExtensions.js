'use strict';

/**
 * Extensions du cœur d'orchestration : concepts avancés (retry/dead-letter,
 * rejeu causal, bisection causale, campagne d'évaluation, benchmark,
 * progressive delivery). Délègue aux services existants.
 */

const { withRetry } = require('./retryUtils');

const SCHEMA = 'genos.orchestration-extensions/v1';

function deadLetterJob(job, raison) {
  return { ...job, state: 'DEAD_LETTER', dead_letter: true, dead_letter_reason: raison };
}

function rejeuCausal(run, traceId) {
  return { ...run, rejeu_causal: { trace_id: traceId, rejoue_le: new Date().toISOString() } };
}

function bisectionCausale(run, intervalle) {
  return {
    ...run,
    bisection_causale: { borne_inf: intervalle[0], borne_sup: intervalle[1], stade: 'en_cours' }
  };
}

function creerCampagneEvaluation(input = {}) {
  return {
    schema: SCHEMA,
    kind: 'campagne_evaluation',
    id: input.id || null,
    nom: input.nom || 'campagne',
    missions: input.missions || [],
    metriques: input.metriques || [],
    created_at: new Date().toISOString()
  };
}

function creerBenchmark(input = {}) {
  return {
    schema: SCHEMA,
    kind: 'benchmark',
    id: input.id || null,
    nom: input.nom || 'benchmark',
    dataset: input.dataset || null,
    protocole: input.protocole || null,
    resultats: [],
    created_at: new Date().toISOString()
  };
}

function progressiveDelivery(run, canal) {
  return {
    ...run,
    progressive_delivery: { canal, statut: 'rollout', demarre_le: new Date().toISOString() }
  };
}

function executerAvecRetry(params) {
  const { db, table, job, executor } = params;
  return withRetry({ db, table, job, executor });
}

module.exports = {
  SCHEMA,
  deadLetterJob,
  rejeuCausal,
  bisectionCausale,
  creerCampagneEvaluation,
  creerBenchmark,
  progressiveDelivery,
  executerAvecRetry
};
