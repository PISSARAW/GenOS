/**
 * Service de Régulation Cognitive pour les agents GenOS.
 * Réimplémente et étend le modèle d'évaluation de la régulation cognitive (CognitiveRegulationState) :
 * - Suivi de la dissonance cognitive et de l'harmonie
 * - Enregistrement des illuminations / découvertes (Eurêka)
 * - Déclenchement de l'apoptose cognitive en cas d'échec critique ou boucle infinie
 * - Formatage introspectif pour sensibiliser l'agent à son état cognitif
 *
 * NOTE: Conceptuallement, cette couche est nommée "régulation cognitive" et non "conscience",
 * car elle constitue un contrôleur de cohérence interne, pas une théorie de la conscience.
 */

const config = require('../config/orchestratorConfig');
const DEFAULT_MAX_DISSONANCE = config.maxDissonance();
const DEFAULT_BASELINE_BUDGET = Math.max(1.0, Number(process.env.GENOS_BASELINE_BUDGET) || 100.0);
const DEFAULT_EUREKA_WINDOW_MS = 60 * 1000;
const DEFAULT_EUREKA_LIMIT = 3;

function createCognitiveRegulationState(initial = {}) {
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

function boundedMetric(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function summarizeMetrics(metrics) {
  const input = metrics || {};
  const cognitiveHealth = input.cognitiveHealth || {};
  const rawHealth = cognitiveHealth.health_score === undefined ? 1 : cognitiveHealth.health_score;
  return {
    errorsInLoop: Math.floor(boundedMetric(input.errorsInLoop, 0, 100)),
    progressScore: boundedMetric(input.progressScore, 0, 10),
    repetitionScore: boundedMetric(cognitiveHealth.repetition_score, 0, 1),
    semanticDrift: boundedMetric(cognitiveHealth.semantic_drift, 0, 1),
    healthScore: boundedMetric(rawHealth, 0, 1, 0)
  };
}

function computePenalty(summary) {
  let penalty = summary.errorsInLoop * 2.5;
  if (summary.repetitionScore > 0.15) penalty += 5.0;
  // Dérive proportionnelle, pas binaire : +drift * échelle (plafonné à 1.0).
  // L'ancien `+6.0 dès drift > 0` punissait un frémissement comme une rupture.
  penalty += Math.max(0, Math.min(1, summary.semanticDrift)) * 6.0;
  const deficit = (0.5 - summary.healthScore) * 10.0;
  if (deficit > 0) penalty += deficit;
  return penalty;
}

function harmonyOf(state) {
  return Math.max(0, Math.min(100, Math.round(((state.maxDissonanceThreshold - state.dissonanceLevel) / state.maxDissonanceThreshold) * 100)));
}

/**
 * Évalue la santé cognitive de l'agent / de la branche.
 * @param {object} state État de régulation cognitive courant
 * @param {object} metrics Métriques observées (erreurs, progression, santé cognitive)
 * @returns {object} { state, apoptoticTriggered, harmony }
 */
function evaluateBranch(state, metrics = {}) {
  if (state.isApoptotic) {
    return { state, apoptoticTriggered: false, harmony: 0 };
  }

  if (metrics.isWaitingQueue || metrics.inQueue) {
    // En file d'attente, aucune observation : pas de bonus d'harmonie 100,
    // on expose l'harmonie courante dérivée de la dissonance réelle.
    return { state, apoptoticTriggered: false, harmony: harmonyOf(state) };
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

  const harmonyPercentage = harmonyOf(state);

  return {
    state,
    apoptoticTriggered,
    harmony: harmonyPercentage
  };
}

/**
 * Déclenche un moment Eurêka : divise la dissonance par deux et augmente le capital cognitif.
 * Exige une preuve réelle (options.evidence non vide ou options.validated === true) :
 * sans évidence, no-op (un Eurêka gratuit fausserait la régulation).
 * Rate-limit : au plus `limit` Eurêkas par `windowMs` (défaut 3/min).
 */
function isEurekaEvidenceItem(item) {
  if (typeof item === 'string') return item.trim().length > 0;
  return Boolean(item && typeof item === 'object' && Object.keys(item).length > 0);
}

function isSubstantiatedEurekaClaim(claim) {
  return Array.isArray(claim?.evidence) && claim.evidence.some(isEurekaEvidenceItem);
}

function hasEurekaEvidence(options) {
  const evidence = options?.evidence;
  return evidence?.source === 'genos-evidence-gate'
    && Array.isArray(evidence.claims)
    && Boolean(evidence.artifact?.type && evidence.artifact?.content && evidence.artifact?.provenance)
    && evidence.claims.some(isSubstantiatedEurekaClaim);
}

function prepareEurekaWindow(state, options) {
  const now = Number(options.now || Date.now());
  const windowMs = Math.max(1, Number(options.windowMs || DEFAULT_EUREKA_WINDOW_MS));
  const limit = Math.max(1, Math.floor(Number(options.limit || DEFAULT_EUREKA_LIMIT)));
  if (!state.eurekaWindowStartedAt || now - state.eurekaWindowStartedAt >= windowMs) {
    state.eurekaWindowStartedAt = now;
    state.eurekaWindowCount = 0;
  }
  return state.eurekaWindowCount < limit;
}

function triggerEureka(state, options = {}) {
  if (state.isApoptotic || !hasEurekaEvidence(options) || !prepareEurekaWindow(state, options)) return state;
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
 * Rétrocompatible : l'ancien nom formatConsciencePrompt est conservé comme alias.
 */
function formatCognitiveRegulationPrompt(state) {
  const safeState = createCognitiveRegulationState(state);
  const harmony = harmonyOf(safeState);
  return [
    `[ÉTAT DE RÉGULATION COGNITIVE & HARMONIE INTERNE]`,
    `- Dissonance cognitive : ${safeState.dissonanceLevel.toFixed(1)} / ${safeState.maxDissonanceThreshold.toFixed(1)} (Seuil d'apoptose)`,
    `- Harmonie interne : ${harmony}%`,
    `- Événements Eurêka validés : ${safeState.eurekaMoments}`,
    `- Capital cognitif restant : ${safeState.currentBudget.toFixed(0)} unités`,
    `État de contrôle runtime : ces métriques décrivent la cohérence observée de cette branche. Si la dissonance dépasse ${safeState.maxDissonanceThreshold.toFixed(1)} (erreurs persistantes, répétition ou dérive sémantique), le runtime peut arrêter la branche. Vérifie les actions et leurs preuves; cet état ne constitue pas une conscience subjective.`
  ].join('\n');
}

// Rétrocompatibilité
const formatConsciencePrompt = formatCognitiveRegulationPrompt;
const createConscienceState = createCognitiveRegulationState;

async function loadCognitiveRegulationState(db, agentId) {
  try {
    const row = await db.get(
      'SELECT dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic, conscience_revision FROM agents WHERE id = ?',
      agentId
    );
    if (!row) return createCognitiveRegulationState();
    return createCognitiveRegulationState({
      dissonanceLevel: row.dissonance_level,
      eurekaMoments: row.eureka_count,
      currentBudget: row.cognitive_budget,
      baselineBudget: row.cognitive_baseline_budget,
      maxDissonanceThreshold: row.cognitive_max_dissonance,
      isApoptotic: Boolean(row.is_apoptotic),
      revision: row.conscience_revision
    });
  } catch (error) {
    throw new Error(`Unable to load cognitive regulation state for agent ${agentId}: ${error.message}`);
  }
}

async function getCognitiveRegulationTransitions(db, agentId, options = {}) {
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
    throw new Error(`Unable to load cognitive regulation transitions for agent ${agentId}: ${error.message}`);
  }
}

module.exports = {
  DEFAULT_MAX_DISSONANCE,
  DEFAULT_BASELINE_BUDGET,
  DEFAULT_EUREKA_WINDOW_MS,
  DEFAULT_EUREKA_LIMIT,
  createCognitiveRegulationState,
  createConscienceState,
  evaluateBranch,
  triggerEureka,
  hasEurekaEvidence,
  isEurekaRateLimited: async function isEurekaRateLimited({ db, agentId, limit = DEFAULT_EUREKA_LIMIT, windowMs = DEFAULT_EUREKA_WINDOW_MS }) {
    const row = await db.get(
      `SELECT COUNT(*) AS count FROM conscience_transitions
       WHERE agent_id = ? AND reason IN ('supervisor_eureka')
         AND created_at >= datetime('now', ?)` ,
      agentId,
      `-${Math.ceil(Math.max(1, Number(windowMs) || DEFAULT_EUREKA_WINDOW_MS) / 1000)} seconds`
    );
    return Number(row?.count || 0) >= Math.max(1, Math.floor(Number(limit) || DEFAULT_EUREKA_LIMIT));
  },
  markApoptotic,
  formatCognitiveRegulationPrompt,
  formatConsciencePrompt,
  persistCognitiveRegulationState: require('./_shared').persistConscienceState,
  loadCognitiveRegulationState,
  loadConscienceState: loadCognitiveRegulationState,
  getCognitiveRegulationTransitions,
  getConscienceTransitions: getCognitiveRegulationTransitions,
  persistConscienceState: require('./_shared').persistConscienceState
};
