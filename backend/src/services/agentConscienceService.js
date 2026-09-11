/**
 * Service de Conscience Cognitive pour les agents GenOS.
 * Réimplémente et étend le modèle d'évaluation de la Conscience (ConscienceState) :
 * - Suivi de la dissonance cognitive et de l'harmonie
 * - Enregistrement des illuminations / découvertes (Eurêka)
 * - Déclenchement de l'apoptose cognitive en cas d'échec critique ou boucle infinie
 * - Formatage introspectif pour sensibiliser l'agent à son état cognitif
 */

const DEFAULT_MAX_DISSONANCE = Math.max(1.0, Number(process.env.GENOS_MAX_DISSONANCE) || 50.0);
const DEFAULT_BASELINE_BUDGET = Math.max(1.0, Number(process.env.GENOS_BASELINE_BUDGET) || 100.0);
const DEFAULT_EUREKA_WINDOW_MS = 60 * 1000;
const DEFAULT_EUREKA_LIMIT = 3;
const persistTails = new Map();
const { resolveConflictIntoState } = require('./conscienceMerge');

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

function summarizeMetrics(metrics) {
  const input = metrics || {};
  const cognitiveHealth = input.cognitiveHealth || {};
  const rawHealth = cognitiveHealth.health_score === undefined ? 1 : cognitiveHealth.health_score;
  return {
    errorsInLoop: Math.max(0, Number(input.errorsInLoop) || 0),
    progressScore: Math.max(0, Number(input.progressScore) || 0),
    repetitionScore: Math.max(0, Number(cognitiveHealth.repetition_score) || 0),
    semanticDrift: Math.max(0, Number(cognitiveHealth.semantic_drift) || 0),
    healthScore: Math.max(0, Math.min(1, Number(rawHealth)))
  };
}

function computePenalty(summary) {
  let penalty = summary.errorsInLoop * 2.5;
  if (summary.repetitionScore > 0.15) penalty += 5.0;
  if (summary.semanticDrift > 0) penalty += 6.0;
  const deficit = (0.5 - summary.healthScore) * 10.0;
  if (deficit > 0) penalty += deficit;
  return penalty;
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

  if (metrics.isWaitingQueue || metrics.inQueue) {
    return { state, apoptoticTriggered: false, harmony: 100 };
  }

  const summary = summarizeMetrics(metrics);
  const penalty = computePenalty(summary);
  const relief = summary.progressScore * 3.0;

  state.dissonanceLevel = Math.max(0, state.dissonanceLevel + penalty - relief);
  state.currentBudget = Math.max(0, state.currentBudget - 1.0);

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
async function persistConscienceState(..._args) {
  const [db, agentId, state, options] = _args;
  const opts = options || {};
  const previousTail = persistTails.get(agentId) || Promise.resolve();
  const operation = previousTail.catch(() => {}).then(() => { return persistConscienceStateNow(db, agentId, state, true, opts); });
  const tracked = operation.catch(() => {}).finally(() => {
    if (persistTails.get(agentId) === tracked) persistTails.delete(agentId);
  });
  persistTails.set(agentId, tracked);
  return operation;
}

async function recordConscienceTransition(db, transition) {
  const options = transition.options || {};
  const reason = String(options.reason || 'evaluation');
  const fromApoptotic = transition.previous.is_apoptotic ? 1 : 0;
  const toApoptotic = transition.state.isApoptotic ? 1 : 0;
  await db.run(
    'INSERT INTO conscience_transitions (agent_id, from_revision, to_revision, from_dissonance, to_dissonance, from_budget, to_budget, from_apoptotic, to_apoptotic, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    transition.agentId,
    transition.previous.conscience_revision,
    transition.state.revision + 1,
    transition.previous.dissonance_level,
    transition.state.dissonanceLevel,
    transition.previous.cognitive_budget,
    transition.state.currentBudget,
    fromApoptotic,
    toApoptotic,
    reason
  );
}

async function persistConscienceStateNow(..._args) {
  const [db, agentId, state, retryArg, optionsArg] = _args;
  const retry = retryArg === undefined ? true : retryArg;
  const options = optionsArg || {};
  const previous = await db.get(
    'SELECT dissonance_level, cognitive_budget, is_apoptotic, conscience_revision, updated_at FROM agents WHERE id = ?',
    agentId
  );
  if (!previous) {
    throw new Error(`Agent ${agentId} not found in database for conscience persistence`);
  }
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
    const current = await db.get(
      'SELECT dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic, conscience_revision, updated_at FROM agents WHERE id = ?',
      agentId
    );
    if (!current) throw new Error(`Conscience state conflict for agent ${agentId} at revision ${state.revision}`);
    resolveConflictIntoState(state, previous, current);
    return persistConscienceStateNow(db, agentId, state, false, options);
  }
  await recordConscienceTransition(db, { agentId, previous, state, options });
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

/**
 * Récupère l'historique des transitions de conscience pour un agent.
 */
async function getConscienceTransitions(db, agentId, options = {}) {
  const limit = Math.max(1, Math.min(200, Math.floor(Number(options.limit) || 50)));
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  try {
    const rows = await db.all(
      `SELECT id, agent_id as agentId, from_revision as fromRevision, to_revision as toRevision,
              from_dissonance as fromDissonance, to_dissonance as toDissonance,
              from_budget as fromBudget, to_budget as toBudget,
              from_apoptotic as fromApoptotic, to_apoptotic as toApoptotic,
              reason, created_at as createdAt
       FROM conscience_transitions
       WHERE agent_id = ?
       ORDER BY to_revision DESC, id DESC
       LIMIT ? OFFSET ?`,
      agentId,
      limit,
      offset
    );
    return rows || [];
  } catch (error) {
    throw new Error(`Unable to load conscience transitions for agent ${agentId}: ${error.message}`);
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
  loadConscienceState,
  getConscienceTransitions
};
