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
const DEFAULT_EUREKA_WINDOW_MS = 60 * 1000;
const DEFAULT_EUREKA_LIMIT = 3;
const persistTails = new Map();

function createConscienceState(initial = {}) {
  const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    currentBudget: Math.max(0, finiteOr(initial.currentBudget, DEFAULT_BASELINE_BUDGET)),
    baselineBudget: Math.max(0, finiteOr(initial.baselineBudget, DEFAULT_BASELINE_BUDGET)),
    dissonanceLevel: Math.max(0, finiteOr(initial.dissonanceLevel, 0.0)),
    eurekaMoments: Math.max(0, Math.floor(finiteOr(initial.eurekaMoments, 0))),
    isApoptotic: Boolean(initial.isApoptotic ?? false),
    maxDissonanceThreshold: Math.max(0.000001, finiteOr(initial.maxDissonanceThreshold, DEFAULT_MAX_DISSONANCE)),
    revision: Math.max(0, Math.floor(finiteOr(initial.revision, 0))),
    eurekaWindowStartedAt: finiteOr(initial.eurekaWindowStartedAt, 0),
    eurekaWindowCount: Math.max(0, Math.floor(finiteOr(initial.eurekaWindowCount, 0)))
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
  const cognitiveHealth = metrics.cognitiveHealth || {};
  const repetitionScore = Math.max(0, Number(cognitiveHealth.repetition_score) || 0);
  const semanticDrift = Math.max(0, Number(cognitiveHealth.semantic_drift) || 0);
  const healthScore = Math.max(0, Math.min(1, Number(cognitiveHealth.health_score ?? 1)));

  const penalty = errorsInLoop * 2.5
    + (repetitionScore > 0.15 ? 5.0 : 0)
    + (semanticDrift > 0 ? 6.0 : 0)
    + ((0.5 - healthScore) * 10.0 > 0 ? (0.5 - healthScore) * 10.0 : 0);
  const relief = progressScore * 3.0;

  state.dissonanceLevel = Math.max(0, state.dissonanceLevel + penalty - relief);
  state.currentBudget = Math.max(0, state.currentBudget - 1.0 - errorsInLoop);

  let apoptoticTriggered = false;
  if (state.dissonanceLevel >= state.maxDissonanceThreshold || state.currentBudget <= 0) {
    markApoptotic(state);
    apoptoticTriggered = true;
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
function triggerEureka(state, options = {}) {
  if (state.isApoptotic) return state;
  const now = Number(options.now || Date.now());
  const windowMs = Math.max(1, Number(options.windowMs || DEFAULT_EUREKA_WINDOW_MS));
  const limit = Math.max(1, Math.floor(Number(options.limit || DEFAULT_EUREKA_LIMIT)));
  if (!state.eurekaWindowStartedAt || now - state.eurekaWindowStartedAt >= windowMs) {
    state.eurekaWindowStartedAt = now;
    state.eurekaWindowCount = 0;
  }
  if (state.eurekaWindowCount >= limit) return state;
  state.eurekaWindowCount += 1;
  state.eurekaMoments += 1;
  state.dissonanceLevel = Math.max(0, state.dissonanceLevel / 2.0);
  state.currentBudget = Math.min(state.baselineBudget, state.currentBudget + 50.0);
  return state;
}

function markApoptotic(state) {
  if (state.isApoptotic) return false;
  state.isApoptotic = true;
  state.currentBudget = 0.0;
  return true;
}

/**
 * Formate un bloc d'introspection cognitive à injecter dans le prompt de l'agent.
 */
function formatConsciencePrompt(state) {
  const safeState = createConscienceState(state);
  const harmony = Math.max(0, Math.min(100, Math.round(((safeState.maxDissonanceThreshold - safeState.dissonanceLevel) / safeState.maxDissonanceThreshold) * 100)));
  return [
    `[ÉTAT DE CONSCIENCE & HARMONIE COGNITIVE]`,
    `- Dissonance cognitive : ${safeState.dissonanceLevel.toFixed(1)} / ${safeState.maxDissonanceThreshold.toFixed(1)} (Seuil d'apoptose)`,
    `- Harmonie interne : ${harmony}%`,
    `- Événements Eurêka validés : ${safeState.eurekaMoments}`,
    `- Capital cognitif restant : ${safeState.currentBudget.toFixed(0)} unités`,
    `État de contrôle runtime : ces métriques décrivent la cohérence observée de cette branche. Si la dissonance dépasse ${safeState.maxDissonanceThreshold.toFixed(1)} (erreurs persistantes, répétition ou dérive sémantique), le runtime peut arrêter la branche. Vérifie les actions et leurs preuves; cet état ne constitue pas une conscience subjective.`
  ].join('\n');
}

/**
 * Persiste l'état de conscience en base SQLite si les colonnes existent.
 */
async function persistConscienceState(db, agentId, state) {
  const previousTail = persistTails.get(agentId) || Promise.resolve();
  const operation = previousTail.catch(() => {}).then(() => persistConscienceStateNow(db, agentId, state));
  const tracked = operation.finally(() => {
    if (persistTails.get(agentId) === tracked) persistTails.delete(agentId);
  });
  persistTails.set(agentId, tracked);
  return operation;
}

async function persistConscienceStateNow(db, agentId, state, retry = true) {
  const previous = await db.get(
    'SELECT dissonance_level, cognitive_budget, is_apoptotic, conscience_revision FROM agents WHERE id = ?',
    agentId
  );
  const result = await db.run(
      `UPDATE agents SET 
         dissonance_level = ?, 
         eureka_count = ?, 
         cognitive_budget = ?,
         cognitive_baseline_budget = ?,
         cognitive_max_dissonance = ?,
         is_apoptotic = ?,
         conscience_revision = conscience_revision + 1,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND conscience_revision = ?`,
      state.dissonanceLevel,
      state.eurekaMoments,
      state.currentBudget,
      state.baselineBudget,
      state.maxDissonanceThreshold,
      state.isApoptotic ? 1 : 0,
      agentId,
      state.revision
  );
  if (result.changes !== 1) {
    if (!retry) throw new Error(`Conscience state conflict for agent ${agentId} at revision ${state.revision}`);
    const current = await loadConscienceState(db, agentId);
    state.dissonanceLevel = Math.max(state.dissonanceLevel, current.dissonanceLevel);
    state.eurekaMoments = Math.max(state.eurekaMoments, current.eurekaMoments);
    state.currentBudget = Math.min(state.currentBudget, current.currentBudget);
    state.isApoptotic = state.isApoptotic || current.isApoptotic;
    state.revision = current.revision;
    return persistConscienceStateNow(db, agentId, state, false);
  }
  await db.run(
    `INSERT INTO conscience_transitions
      (agent_id, from_revision, to_revision, from_dissonance, to_dissonance,
       from_budget, to_budget, from_apoptotic, to_apoptotic)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    agentId,
    previous?.conscience_revision ?? state.revision,
    state.revision + 1,
    previous?.dissonance_level ?? state.dissonanceLevel,
    state.dissonanceLevel,
    previous?.cognitive_budget ?? state.currentBudget,
    state.currentBudget,
    previous?.is_apoptotic ? 1 : 0,
    state.isApoptotic ? 1 : 0
  );
  state.revision += 1;
}

/**
 * Charge l'état de conscience depuis la base SQLite.
 */
async function loadConscienceState(db, agentId) {
  try {
    const row = await db.get(
      'SELECT dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic, conscience_revision FROM agents WHERE id = ?',
      agentId
    );
    if (!row) return createConscienceState();
    return createConscienceState({
      dissonanceLevel: row.dissonance_level,
      eurekaMoments: row.eureka_count,
      currentBudget: row.cognitive_budget,
      baselineBudget: row.cognitive_baseline_budget,
      maxDissonanceThreshold: row.cognitive_max_dissonance,
      isApoptotic: Boolean(row.is_apoptotic),
      revision: row.conscience_revision
    });
  } catch (error) {
    throw new Error(`Unable to load conscience state for agent ${agentId}: ${error.message}`);
  }
}

module.exports = {
  DEFAULT_MAX_DISSONANCE,
  DEFAULT_BASELINE_BUDGET,
  DEFAULT_EUREKA_WINDOW_MS,
  DEFAULT_EUREKA_LIMIT,
  createConscienceState,
  evaluateBranch,
  triggerEureka,
  markApoptotic,
  formatConsciencePrompt,
  persistConscienceState,
  loadConscienceState
};
