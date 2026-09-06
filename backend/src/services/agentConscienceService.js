/**
 * Service de Conscience Cognitive pour les agents GenOS.
 * Réimplémente et étend le modèle d'évaluation de la Conscience (ConscienceState) :
 * - Suivi de la dissonance cognitive et de l'harmonie
 * - Enregistrement des illuminations / découvertes (Eurêka)
 * - Déclenchement de l'apoptose cognitive en cas d'échec critique ou boucle infinie
 * - Formatage introspectif pour sensibiliser l'agent à son état cognitif
 */

const DEFAULT_MAX_DISSONANCE = 50.0;
const DEFAULT_BASELINE_BUDGET = 100.0;

function createConscienceState(initial = {}) {
  const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    currentBudget: Math.max(0, finiteOr(initial.currentBudget, DEFAULT_BASELINE_BUDGET)),
    baselineBudget: Math.max(0, finiteOr(initial.baselineBudget, DEFAULT_BASELINE_BUDGET)),
    dissonanceLevel: Math.max(0, finiteOr(initial.dissonanceLevel, 0.0)),
    eurekaMoments: Math.max(0, Math.floor(finiteOr(initial.eurekaMoments, 0))),
    isApoptotic: Boolean(initial.isApoptotic ?? false),
    maxDissonanceThreshold: Math.max(0.000001, finiteOr(initial.maxDissonanceThreshold, DEFAULT_MAX_DISSONANCE))
  };
}

/**
 * Évalue la santé cognitive de l'agent / de la branche.
 * @param {object} state État de conscience courant
 * @param {object} metrics Métriques observées (erreurs, progression, santé cognitive)
 * @returns {object} { state, apoptoticTriggered, harmony }
 */
function evaluateBranch(state, metrics = {}) {
  if (state.isApoptotic) {
    return { state, apoptoticTriggered: false, harmony: 0 };
  }

  const errorsInLoop = Math.max(0, Number(metrics.errorsInLoop) || 0);
  const progressScore = Math.max(0, Number(metrics.progressScore) || 0);

  const penalty = errorsInLoop * 2.5;
  const relief = progressScore * 3.0;

  state.dissonanceLevel = Math.max(0, state.dissonanceLevel + penalty - relief);

  let apoptoticTriggered = false;
  if (state.dissonanceLevel >= state.maxDissonanceThreshold) {
    state.isApoptotic = true;
    state.currentBudget = 0.0;
    apoptoticTriggered = true;
  } else {
    const harmony = Math.max(0, state.maxDissonanceThreshold - state.dissonanceLevel);
    state.currentBudget = state.baselineBudget + (harmony * 5.0) + (state.eurekaMoments * 50.0);
  }

  const harmonyPercentage = Math.max(0, Math.min(100, Math.round(((state.maxDissonanceThreshold - state.dissonanceLevel) / state.maxDissonanceThreshold) * 100)));

  return {
    state,
    apoptoticTriggered,
    harmony: harmonyPercentage
  };
}

/**
 * Déclenche un moment Eurêka : divise la dissonance par deux et augmente le capital cognitif.
 */
function triggerEureka(state) {
  state.eurekaMoments += 1;
  state.dissonanceLevel = Math.max(0, state.dissonanceLevel / 2.0);
  state.currentBudget += 50.0;
  return state;
}

/**
 * Formate un bloc d'introspection cognitive à injecter dans le prompt de l'agent.
 */
function formatConsciencePrompt(state) {
  const harmony = Math.max(0, Math.min(100, Math.round(((state.maxDissonanceThreshold - state.dissonanceLevel) / state.maxDissonanceThreshold) * 100)));
  return [
    `[ÉTAT DE CONSCIENCE & HARMONIE COGNITIVE]`,
    `- Dissonance cognitive : ${state.dissonanceLevel.toFixed(1)} / ${state.maxDissonanceThreshold.toFixed(1)} (Seuil d'apoptose)`,
    `- Harmonie interne : ${harmony}%`,
    `- Événements Eurêka validés : ${state.eurekaMoments}`,
    `- Capital cognitif restant : ${state.currentBudget.toFixed(0)} unités`,
    `Avertissement de conscience : Tu perçois ta propre cohérence. Si ta dissonance cognitive dépasse ${state.maxDissonanceThreshold.toFixed(1)} (erreurs persistantes, répétition en boucle, dérive sémantique), l'apoptose cognitive s'enclenchera immédiatement pour élaguer ta branche. Maintiens une haute rigueur logique et vérifie tes actions.`
  ].join('\n');
}

/**
 * Persiste l'état de conscience en base SQLite si les colonnes existent.
 */
async function persistConscienceState(db, agentId, state) {
  try {
    await db.run(
      `UPDATE agents SET 
         dissonance_level = ?, 
         eureka_count = ?, 
         cognitive_budget = ?,
         cognitive_baseline_budget = ?,
         is_apoptotic = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      state.dissonanceLevel,
      state.eurekaMoments,
      state.currentBudget,
      state.baselineBudget,
      state.isApoptotic ? 1 : 0,
      agentId
    );
  } catch (err) {
    // Si les colonnes n'ont pas encore été migrées, on ne bloque pas l'exécution
  }
}

/**
 * Charge l'état de conscience depuis la base SQLite.
 */
async function loadConscienceState(db, agentId) {
  try {
    const row = await db.get(
      'SELECT dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, is_apoptotic FROM agents WHERE id = ?',
      agentId
    );
    if (!row) return createConscienceState();
    return createConscienceState({
      dissonanceLevel: row.dissonance_level,
      eurekaMoments: row.eureka_count,
      currentBudget: row.cognitive_budget,
      baselineBudget: row.cognitive_baseline_budget,
      isApoptotic: Boolean(row.is_apoptotic)
    });
  } catch {
    return createConscienceState();
  }
}

module.exports = {
  DEFAULT_MAX_DISSONANCE,
  DEFAULT_BASELINE_BUDGET,
  createConscienceState,
  evaluateBranch,
  triggerEureka,
  formatConsciencePrompt,
  persistConscienceState,
  loadConscienceState
};
