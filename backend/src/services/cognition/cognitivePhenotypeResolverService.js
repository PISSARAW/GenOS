'use strict';

/**
 * Cognitive Key System — résolveur de phénotype dynamique (ADR 0033,
 * points 5-6).
 *
 * Transforme l'assignation statique des CognitiveKeys en phénotype
 * cognitif qui évolue pendant la mission selon :
 *  - l'état épistémique (ce que l'agent sait, croit, doute) ;
 *  - la mémoire contextuelle (performances passées des recettes) ;
 *  - la pression régulatoire (contraintes, blocages, budget).
 *
 * Le phénotype est une recette versionnée qui ne touche jamais au
 * génome (DNA) : la mutation se fait sur la recette, pas sur les clés.
 *
 * Quatre opérations :
 *  - resolvePhenotype : construit un phénotype depuis un contexte riche ;
 *  - mutateRecipe : fait évoluer une recette existante (pression + preuve) ;
 *  - getRecipeUtility : score d'utilité d'une recette face à des preuves ;
 *  - canMutate : vérifie le budget de mutation restant.
 */

const { COGNITIVE_KEYS } = require('../../cognition/cognitiveKeyDefinitions');
const { validateRecipe } = require('../../cognition/cognitiveRecipeService');
const { mutateRecipe: evolveMutate } = require('../../cognition/cognitiveRecipeEvolution');

const DEFAULT_MUTATION_BUDGET = 3;
const DEFAULT_MAX_KEYS = 4;
const COST_WEIGHTS = { low: 1, medium: 2, high: 3 };

function keyMapOf(keys) {
  return new Map(keys.map((key) => [key.id, key]));
}

function inferNeeds(mission, strategy) {
  const text = [mission, strategy].filter(Boolean).join(' ').toLowerCase();
  if (!text) return [];
  const vocabulary = new Set(COGNITIVE_KEYS.flatMap((key) => key.usefulWhen));
  return [...vocabulary]
    .filter((need) => text.includes(need.replace(/_/g, ' ')))
    .sort();
}

function memoryAdjustments(memoryContext) {
  if (!memoryContext || !Array.isArray(memoryContext.priorRecipes)) {
    return { boost: [], penalize: [] };
  }
  const boost = [];
  const penalize = [];
  memoryContext.priorRecipes.forEach((entry) => {
    if (entry.performance > 0) boost.push(...entry.keys);
    if (entry.performance < 0) penalize.push(...entry.keys);
  });
  return { boost, penalize };
}

function regulatoryConstraints(regulatoryState) {
  if (!regulatoryState) return { maxKeys: DEFAULT_MAX_KEYS, blockedKeys: [] };
  return {
    maxKeys: regulatoryState.maxKeys || DEFAULT_MAX_KEYS,
    blockedKeys: regulatoryState.blockedKeys || []
  };
}

function resolvePhenotype(ctx) {
  const mission = ctx.mission || '';
  const strategy = ctx.strategy || '';
  const needs = inferNeeds(mission, strategy);
  const adjustments = memoryAdjustments(ctx.memoryContext);
  const constraints = regulatoryConstraints(ctx.regulatoryState);
  const availableKeys = COGNITIVE_KEYS.filter(
    (key) => !constraints.blockedKeys.includes(key.id)
  );
  const keyMap = keyMapOf(availableKeys);
  const prioritized = availableKeys
    .map((key) => ({
      key,
      score: (adjustments.boost.includes(key.id) ? 2 : 0) -
             (adjustments.penalize.includes(key.id) ? 1 : 0) +
             (needs.some((need) => key.usefulWhen.includes(need)) ? 1 : 0)
    }))
    .filter((entry) => entry.score > 0 || needs.length === 0)
    .sort((a, b) => b.score - a.score);
  const selected = prioritized.slice(0, constraints.maxKeys).map((e) => e.key.id);
  if (selected.length === 0 && needs.length > 0) {
    const fallback = availableKeys.find((key) =>
      key.usefulWhen.some((need) => needs.includes(need))
    );
    if (fallback) selected.push(fallback.id);
  }
  if (selected.length === 0) return null;
  const recipe = {
    id: `recipe.phenotype-${Date.now()}`,
    label: 'Dynamic phenotype recipe',
    keys: selected,
    ordering: [],
    objective: { increase: needs }
  };
  const validation = validateRecipe(recipe, availableKeys);
  if (!validation.valid) return null;
  return {
    recipeId: validation.recipe.id,
    version: 1,
    keys: validation.recipe.keys,
    instructions: validation.recipe.keys.map((keyId) => {
      const key = keyMap.get(keyId);
      return key ? { id: key.id, label: key.label, instruction: key.instruction } : null;
    }).filter(Boolean),
    metrics: validation.metrics,
    context: {
      mission,
      needs,
      adjustments,
      constraints,
      failure: ctx.failure || null,
      role: ctx.role || null,
      epistemicState: ctx.epistemicState || null
    },
    mutationBudget: DEFAULT_MUTATION_BUDGET,
    dnaUnchanged: true
  };
}

function getRecipeUtility(recipe, evidence) {
  if (!recipe || !recipe.keys) return 0;
  const keyMap = keyMapOf(COGNITIVE_KEYS);
  const needs = (evidence && evidence.needs) || [];
  const coverage = needs.filter((need) =>
    recipe.keys.some((keyId) => {
      const key = keyMap.get(keyId);
      return key && key.usefulWhen.includes(need);
    })
  ).length;
  const totalNeeds = needs.length || 1;
  const coverageScore = coverage / totalNeeds;
  const cost = recipe.keys.reduce((total, keyId) => {
    const key = keyMap.get(keyId);
    return total + (key ? (COST_WEIGHTS[key.cost] || 0) : 0);
  }, 0);
  const costPenalty = Math.min(cost / 10, 0.5);
  const pastPerformance = (evidence && evidence.pastPerformance && evidence.pastPerformance[recipe.id]) || 0;
  const failurePenalty = (evidence && evidence.recentFailures || 0) * 0.1;
  return Number(Math.max(0, coverageScore - costPenalty + pastPerformance - failurePenalty).toFixed(4));
}

function canMutate(recipe, phenotype) {
  if (!recipe || !phenotype) return false;
  if (typeof phenotype.mutationBudget !== 'number' || phenotype.mutationBudget <= 0) return false;
  return Array.isArray(recipe.keys) && recipe.keys.length > 0;
}

function mutateRecipe(ctx) {
  const currentRecipe = ctx.currentRecipe;
  const pressure = ctx.pressure || {};
  const evidence = ctx.evidence || {};
  if (!currentRecipe || !Array.isArray(currentRecipe.keys) || currentRecipe.keys.length === 0) return null;
  const intensity = pressure.intensity || 1;
  const mutated = evolveMutate(currentRecipe, COGNITIVE_KEYS, {
    maxKeys: currentRecipe.keys.length + (intensity > 1 ? 1 : 0)
  });
  if (!mutated) return null;
  const versioned = {
    ...mutated,
    id: `${currentRecipe.id}-v${(currentRecipe.version || 1) + 1}`,
    version: (currentRecipe.version || 1) + 1,
    parentVersion: currentRecipe.version || 1,
    mutationReason: pressure.type || 'explore',
    dnaUnchanged: true
  };
  const validation = validateRecipe(versioned, COGNITIVE_KEYS);
  if (!validation.valid) return null;
  return {
    recipeId: validation.recipe.id,
    version: validation.recipe.version,
    keys: validation.recipe.keys,
    metrics: validation.metrics,
    mutationReason: pressure.type || 'explore',
    utility: getRecipeUtility(validation.recipe, evidence),
    dnaUnchanged: true
  };
}

module.exports = {
  resolvePhenotype,
  mutateRecipe,
  getRecipeUtility,
  canMutate
};
