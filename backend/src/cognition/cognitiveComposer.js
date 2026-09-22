'use strict';

/**
 * Cognitive Key System — CognitiveComposer (ADR 0033, point 3).
 *
 * Compose des CognitiveRecipes pour une mission : sélectionne des
 * sous-ensembles de CognitiveKeys qui couvrent les besoins cognitifs
 * d'un profil de problème, en maximisant la DIVERSITÉ (opérations
 * distinctes), pas seulement la pertinence individuelle.
 *
 * Principe qualité-diversité : ne pas prendre les N meilleures clés
 * individuellement (elles se recouvrent) — optimiser
 *   utility + coverage + complementarity + cognitive distance
 *   - redundancy - cost
 *
 * Algorithme glouton déterministe :
 *  1. scorer chaque clé par couverture des besoins du profil ;
 *  2. sélection gloutonne avec gain marginal décroissant (chaque
 *     besoin déjà couvert rapporte moins) ;
 *  3. bonus de tension productive : une paire en conflit déclaré
 *     ajoute un gain si les deux clés sont sélectionnées ;
 *  4. respect du budget (nombre de clés et poids de coût).
 *
 * Le composer ne dépend d'aucun LLM : il est purement computationnel
 * et testable, aligné sur le principe « pas de biomimétisme décoratif ».
 */

const { COGNITIVE_KEYS } = require('./cognitiveKeyDefinitions');
const { validateRecipe } = require('./cognitiveRecipeService');

const COST_WEIGHTS = { low: 1, medium: 2, high: 3 };

const DEFAULTS = {
  maxKeys: 4,
  maxCostWeight: 8,
  marginalDecay: 0.5,
  tensionBonus: 1.5
};

function clamp01(value) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return 0;
  return Math.max(0, Math.min(1, resolved));
}

function resolveOptions(options) {
  const merged = { ...DEFAULTS, ...(options || {}) };
  return {
    ...merged,
    maxKeys: Math.max(1, Math.floor(merged.maxKeys)),
    maxCostWeight: Math.max(1, Math.floor(merged.maxCostWeight)),
    excludeKeys: new Set(merged.excludeKeys || [])
  };
}

/**
 * Pertinence d'une clé pour un besoin : 1 si le besoin est déclaré
 * dans usefulWhen, 0 sinon. Vocabulaire v1 : correspondance exacte —
 * le rapprochement sémantique attend l'apprentissage des point 7/9.
 */
function keyNeedRelevance(key, need) {
  return key.usefulWhen.includes(need) ? 1 : 0;
}

function keyUtility(key, needs) {
  if (needs.length === 0) return 1;
  const covered = needs.filter((need) => keyNeedRelevance(key, need)).length;
  return covered / needs.length;
}

function keyCostWeight(key) {
  return COST_WEIGHTS[key.cost] || 0;
}

function utilityScore(key, needs, coveredNeeds) {
  const fresh = needs.filter((need) => keyNeedRelevance(key, need) && !coveredNeeds.has(need));
  const already = needs.filter((need) => keyNeedRelevance(key, need) && coveredNeeds.has(need));
  return (fresh.length + DEFAULTS.marginalDecay * already.length) / Math.max(needs.length, 1);
}

function tensionContribution(key, selectedIds) {
  return key.conflictsWith.filter((otherId) => selectedIds.has(otherId)).length;
}

function bestCandidate(candidates, needs, search) {
  const { options, state } = search;
  let best = null;
  let bestScore = -Infinity;
  candidates.forEach((key, index) => {
    const weight = keyCostWeight(key);
    if (state.usedWeight + weight > options.maxCostWeight) return;
    const utility = utilityScore(key, needs, state.coveredNeeds);
    const novelty = state.usedOperations.has(key.operation) ? 0 : 1;
    const tension = options.tensionBonus * tensionContribution(key, state.selectedIds);
    const diversity = options.diversityBias ? options.diversityBias(key) : 0;
    const score = utility + 0.5 * novelty + tension + diversity - 0.1 * weight;
    if (score > bestScore) {
      bestScore = score;
      best = { index, key };
    }
  });
  return { best, bestScore };
}

function selectKeys(keys, needs, options) {
  const excluded = options.excludeKeys || new Set();
  const pool = keys.filter((key) => !excluded.has(key.id));
  if (pool.length === 0) return [];
  const state = {
    selected: [],
    selectedIds: new Set(),
    coveredNeeds: new Set(),
    usedOperations: new Set(),
    usedWeight: 0
  };

  const candidates = [...pool];
  const search = { options, state };
  while (state.selected.length < options.maxKeys && candidates.length > 0) {
    const { best, bestScore } = bestCandidate(candidates, needs, search);
    if (!best || bestScore <= 0) break;
    const { key } = best;
    state.selected.push(key);
    state.selectedIds.add(key.id);
    state.usedOperations.add(key.operation);
    state.usedWeight += keyCostWeight(key);
    key.usefulWhen.forEach((need) => {
      if (needs.includes(need)) state.coveredNeeds.add(need);
    });
    candidates.splice(best.index, 1);
  }
  return state.selected;
}

/**
 * Compose une recette pour un profil de problème.
 * @param {Object} input
 * @param {string} input.id - ID recipe.* de la recette
 * @param {string} input.label
 * @param {string[]} input.needs - besoins cognitifs (ex. causal_uncertainty)
 * @param {Object} [input.options] - budgets (maxKeys, maxCostWeight)
 * @param {Array} [input.keys] - registre de clés (injection pour tests)
 * @returns {Object} résultat validateRecipe + composition
 */
function composeRecipe(input) {
  const keys = input.keys || COGNITIVE_KEYS;
  const options = resolveOptions(input.options);
  const needs = (input.needs || []).filter((need) => typeof need === 'string');

  const selected = selectKeys(keys, needs, options);
  const recipe = {
    id: input.id,
    label: input.label,
    keys: selected.map((key) => key.id),
    ordering: [],
    objective: {
      increase: needs,
      avoid: ['premature_convergence', 'redundant_perspectives']
    }
  };

  const validation = validateRecipe(recipe, keys);
  return {
    ...validation,
    composition: {
      needs,
      options,
      selectedKeys: selected.map((key) => ({ id: key.id, operation: key.operation, cost: key.cost }))
    }
  };
}

module.exports = {
  composeRecipe,
  selectKeys,
  keyUtility,
  clamp01
};
