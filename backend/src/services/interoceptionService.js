'use strict';

/**
 * Interoception — lecture des signaux internes de l'agent pour le planificateur allostatique.
 *
 * Ce service ne produit aucune sensation viscérale. Il expose des signaux machine
 * (budget cognitif, dissonance, santé cognitive, stress) que le planificateur
 * allostatique utilise pour borner le fanout et les éditions avant exécution.
 * Classification : analogue fonctionnel de l'interoception biologique, pas
 * perception physiologique.
 */

const conscience = require('./agentConscienceService');

function clamp01(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

/**
 * Lit l'état de régulation cognitive d'un agent et en déduit les signaux
 * interoceptifs machine : budget restant, niveau de dissonance, santé cognitive,
 * stress dérivé.
 *
 * @param {object} db Connexion base de données
 * @param {string} agentId Identifiant de l'agent
 * @returns {object} Signaux interoceptifs + limitation explicite
 */
async function readInternalSignals(db, agentId) {
  if (!db || !agentId) {
    return {
      signals: { energy: 0, dissonance: 1, health: 0, stress: 1 },
      source: 'machine_interoception',
      status: 'insufficient_data',
      limitation: 'Agent ou base de données manquants ; signaux par défaut défavorables.'
    };
  }

  let state;
  try {
    state = await conscience.loadCognitiveRegulationState(db, agentId);
  } catch (_) {
    state = conscience.createCognitiveRegulationState();
  }

  const budgetRatio = state.baselineBudget > 0
    ? clamp01(state.currentBudget / state.baselineBudget)
    : 0;
  const dissonance = clamp01(state.dissonanceLevel / Math.max(state.maxDissonanceThreshold, 1));
  const health = clamp01(1 - dissonance);
  const stress = clamp01(dissonance * 0.7 + (1 - budgetRatio) * 0.3);

  return {
    signals: {
      energy: budgetRatio,
      dissonance,
      health,
      stress
    },
    source: 'machine_interoception',
    status: 'measured',
    limitation: 'Signaux déduits de l\'état de régulation cognitive ; pas de sensation viscérale, pas de mesure physiologique.'
  };
}

/**
 * Produit un snapshot de posture allostatique à partir des signaux interoceptifs,
 * directement consommable par `allostaticPlanningService.applyMeasuredPosture`.
 *
 * @param {object} db Connexion base de données
 * @param {string} agentId Identifiant de l'agent
 * @returns {object} Snapshot allostatique
 */
async function allostaticSnapshot(db, agentId) {
  const reading = await readInternalSignals(db, agentId);
  if (reading.status !== 'measured') {
    return {
      status: 'insufficient_data',
      source: 'machine_interoception',
      variables: { energy: 0, integrity: 0, stress: 1, context_pressure: 1, model_drift: 1 },
      selectedActions: [],
      limitation: reading.limitation
    };
  }

  const { signals } = reading;
  const variables = {
    energy: signals.energy,
    integrity: signals.health,
    stress: signals.stress,
    context_pressure: signals.dissonance,
    model_drift: signals.dissonance
  };

  return {
    status: 'measured',
    source: 'machine_interoception',
    variables,
    signals,
    limitation: reading.limitation
  };
}

module.exports = { readInternalSignals, allostaticSnapshot };
