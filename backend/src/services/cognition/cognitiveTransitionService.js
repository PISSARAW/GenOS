'use strict';

/**
 * Cognitive Key System — service de transition de recettes (ADR 0033,
 * points 5-6).
 *
 * Gère le cycle de vie complet d'une transition de phénotype :
 *  - proposeTransition : génère une recette candidate justifiée ;
 *  - validateTransition : vérifie les contraintes (budget, clés requises) ;
 *  - executeTransition : met à jour la recette active d'un agent.
 *
 * La transition ne modifie jamais le génome (DNA) : seule la recette
 * du phénotype est versionnée.
 */

const { COGNITIVE_KEYS } = require('../../cognition/cognitiveKeyDefinitions');
const { validateRecipe } = require('../../cognition/cognitiveRecipeService');
const { getRecipeUtility } = require('./cognitivePhenotypeResolverService');

const COST_WEIGHTS = { low: 1, medium: 2, high: 3 };

function keyMapOf(keys) {
  return new Map(keys.map((key) => [key.id, key]));
}

function recipeCost(recipe, keyMap) {
  return recipe.keys.reduce((total, keyId) => {
    const key = keyMap.get(keyId);
    return total + (key ? (COST_WEIGHTS[key.cost] || 0) : 0);
  }, 0);
}

function proposeTransition(ctx) {
  const currentRecipe = ctx.currentRecipe;
  const evidence = ctx.evidence || {};
  const pressure = ctx.pressure || {};
  if (!currentRecipe || !Array.isArray(currentRecipe.keys)) return null;
  const keyMap = keyMapOf(COGNITIVE_KEYS);
  const needs = evidence.needs || [];
  const currentUtility = getRecipeUtility(currentRecipe, evidence);
  const coveredNeeds = new Set();
  currentRecipe.keys.forEach((keyId) => {
    const key = keyMap.get(keyId);
    if (key) key.usefulWhen.forEach((need) => {
      if (needs.includes(need)) coveredNeeds.add(need);
    });
  });
  const uncoveredNeeds = needs.filter((need) => !coveredNeeds.has(need));
  const candidates = COGNITIVE_KEYS
    .filter((key) => !currentRecipe.keys.includes(key.id))
    .map((key) => ({
      key,
      relevance: uncoveredNeeds.filter((need) => key.usefulWhen.includes(need)).length,
      cost: COST_WEIGHTS[key.cost] || 1
    }))
    .filter((entry) => entry.relevance > 0 || uncoveredNeeds.length === 0)
    .sort((a, b) => b.relevance - a.relevance || a.cost - b.cost);
  const replacementCount = Math.min(
    pressure.maxReplacements || 1,
    candidates.length,
    currentRecipe.keys.length
  );
  const replacements = candidates.slice(0, replacementCount);
  const proposedKeys = [...currentRecipe.keys];
  replacements.forEach((replacement, index) => {
    const replaceIndex = proposedKeys.length - 1 - index;
    if (replaceIndex >= 0) proposedKeys[replaceIndex] = replacement.key.id;
  });
  const proposed = {
    id: `${currentRecipe.id}-transition`,
    label: 'Proposed transition recipe',
    keys: proposedKeys,
    ordering: [],
    objective: currentRecipe.objective || null
  };
  const validation = validateRecipe(proposed, COGNITIVE_KEYS);
  if (!validation.valid) return null;
  return {
    recipeId: validation.recipe.id,
    version: (currentRecipe.version || 1) + 1,
    keys: validation.recipe.keys,
    metrics: validation.metrics,
    justification: {
      currentUtility,
      proposedUtility: getRecipeUtility(validation.recipe, evidence),
      pressure: pressure.type || 'unknown',
      uncoveredNeeds,
      replacements: replacements.map((r) => r.key.id)
    },
    dnaUnchanged: true
  };
}

function validateTransition(proposed, constraints) {
  const errors = [];
  if (!proposed || !Array.isArray(proposed.keys)) {
    errors.push('proposed recipe must have a keys array');
    return { valid: false, errors };
  }
  if (!constraints) return { valid: true, errors };
  const keyMap = keyMapOf(COGNITIVE_KEYS);
  if (constraints.maxKeys && proposed.keys.length > constraints.maxKeys) {
    errors.push(`exceeds maxKeys (${proposed.keys.length} > ${constraints.maxKeys})`);
  }
  if (constraints.maxCost && recipeCost(proposed, keyMap) > constraints.maxCost) {
    errors.push('exceeds maxCost');
  }
  if (constraints.requiredKeys) {
    const missing = constraints.requiredKeys.filter((id) => !proposed.keys.includes(id));
    if (missing.length > 0) errors.push(`missing required: ${missing.join(', ')}`);
  }
  if (constraints.forbiddenKeys) {
    const forbidden = proposed.keys.filter((id) => constraints.forbiddenKeys.includes(id));
    if (forbidden.length > 0) errors.push(`contains forbidden: ${forbidden.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

function executeTransition(ctx) {
  const agentId = ctx.agentId;
  const fromRecipe = ctx.fromRecipe;
  const toRecipe = ctx.toRecipe;
  if (!agentId || !fromRecipe || !toRecipe) return null;
  const constraints = {
    maxKeys: fromRecipe.keys.length + 1,
    forbiddenKeys: []
  };
  const validation = validateTransition(toRecipe, constraints);
  if (!validation.valid) return null;
  return {
    agentId,
    previousRecipeId: fromRecipe.id,
    activeRecipeId: toRecipe.id,
    version: toRecipe.version || 1,
    keys: toRecipe.keys,
    executedAt: new Date().toISOString(),
    dnaUnchanged: true
  };
}

module.exports = {
  proposeTransition,
  validateTransition,
  executeTransition
};
