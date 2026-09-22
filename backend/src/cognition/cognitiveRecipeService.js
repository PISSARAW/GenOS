'use strict';

/**
 * Cognitive Key System — service CognitiveRecipe (ADR 0033, point 3).
 *
 * Une CognitiveRecipe est une composition temporaire de CognitiveKeys
 * orientée mission. Elle appartient au phénotype cognitif du worker
 * pour UNE mission, jamais au génome.
 *
 * Responsabilités :
 *  - normaliser une recette (apiVersion/kind) et la valider contre
 *    spec/cognitive-recipe.schema.json ;
 *  - FK dure sur les keys : chaque ID doit exister dans le registre de
 *    CognitiveKeys (contrairement à derivedFrom, les clés sont internes
 *    et stables) ;
 *  - valider ordering comme permutation exacte de keys ;
 *  - calculer les métriques dérivées : coverage (besoins couverts),
 *    diversity (opérations distinctes), cost (somme des coûts),
 *    tensions (paires conflictsWith incluses — productives, jamais
 *    rejetées), complementarity (compatibleWith réalisés).
 *
 * Ce service ne compose PAS : la sélection des clés appartient au
 * CognitiveComposer. Il valide et mesure.
 */

const { validateSpec } = require('../services/specValidator');
const { COGNITIVE_KEYS } = require('./cognitiveKeyDefinitions');

const RECIPE_SCHEMA = 'cognitive-recipe.schema.json';
const RECIPE_ID_PATTERN = /^recipe\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

const COST_WEIGHTS = { low: 1, medium: 2, high: 3 };
const COST_LABELS = { 1: 'low', 2: 'medium', 3: 'high' };

function keyById(keys) {
  const map = new Map();
  keys.forEach((key) => map.set(key.id, key));
  return map;
}

function normalizeRecipe(recipe) {
  return {
    apiVersion: 'genos.cognition/v1',
    kind: 'CognitiveRecipe',
    id: recipe.id,
    label: recipe.label,
    keys: recipe.keys,
    ordering: recipe.ordering || [],
    objective: recipe.objective || null
  };
}

function validateKeyReferences(recipe, keyMap) {
  const errors = [];
  recipe.keys.forEach((keyId, index) => {
    if (!keyMap.has(keyId)) {
      errors.push(`keys[${index}] references unknown CognitiveKey '${keyId}'`);
    }
  });
  return errors;
}

function validateOrdering(recipe) {
  if (!recipe.ordering || recipe.ordering.length === 0) return [];
  const sorted = (list) => [...list].sort().join('|');
  if (sorted(recipe.ordering) !== sorted(recipe.keys)) {
    return ['ordering must be an exact permutation of keys'];
  }
  return [];
}

function coveredNeeds(recipe, keyMap) {
  const needs = new Set();
  recipe.keys.forEach((keyId) => {
    const key = keyMap.get(keyId);
    if (key) key.usefulWhen.forEach((need) => needs.add(need));
  });
  return [...needs].sort();
}

function distinctOperations(recipe, keyMap) {
  const ops = new Set();
  recipe.keys.forEach((keyId) => {
    const key = keyMap.get(keyId);
    if (key) ops.add(key.operation);
  });
  return [...ops].sort();
}

function recipeCost(recipe, keyMap) {
  return recipe.keys.reduce((total, keyId) => {
    const key = keyMap.get(keyId);
    return total + (key ? (COST_WEIGHTS[key.cost] || 0) : 0);
  }, 0);
}

function costLabel(total) {
  return COST_LABELS[total] || `weight_${total}`;
}

/**
 * Tensions productives : paires de clés en conflit déclaré incluses
 * dans la recette. Elles ne sont jamais rejetées — elles sont
 * surfacées pour le worker (deux lectures incompatibles du même
 * problème, à confronter).
 */
function productiveTensions(recipe, keyMap) {
  const included = new Set(recipe.keys);
  const tensions = [];
  recipe.keys.forEach((keyId) => {
    const key = keyMap.get(keyId);
    if (!key) return;
    key.conflictsWith.forEach((otherId) => {
      if (included.has(otherId) && keyId < otherId) {
        tensions.push({ a: keyId, b: otherId });
      }
    });
  });
  return tensions;
}

function realizedComplements(recipe, keyMap) {
  const included = new Set(recipe.keys);
  const realized = [];
  recipe.keys.forEach((keyId) => {
    const key = keyMap.get(keyId);
    if (!key) return;
    key.compatibleWith.forEach((otherId) => {
      if (included.has(otherId) && keyId < otherId) {
        realized.push({ a: keyId, b: otherId });
      }
    });
  });
  return realized;
}

function recipeMetrics(recipe, keyMap) {
  const cost = recipeCost(recipe, keyMap);
  return {
    keyCount: recipe.keys.length,
    operations: distinctOperations(recipe, keyMap),
    coveredNeeds: coveredNeeds(recipe, keyMap),
    cost,
    costLabel: costLabel(cost),
    tensions: productiveTensions(recipe, keyMap),
    complements: realizedComplements(recipe, keyMap)
  };
}

function validateRecipe(recipe, keys = COGNITIVE_KEYS) {
  const keyMap = keyById(keys);
  const normalized = normalizeRecipe(recipe);
  const errors = [];

  const schemaResult = validateSpec(RECIPE_SCHEMA, normalized);
  if (!schemaResult.valid) {
    errors.push(...schemaResult.errors.map((error) => `recipe: ${error}`));
  }
  if (!RECIPE_ID_PATTERN.test(normalized.id)) {
    errors.push('id must match the recipe.* dash-segment pattern');
  }
  if (!Array.isArray(normalized.keys) || normalized.keys.length === 0) {
    errors.push('keys must be a non-empty array');
  }
  if (Array.isArray(normalized.keys)) {
    errors.push(...validateKeyReferences(normalized, keyMap));
    errors.push(...validateOrdering(normalized));
  }

  return {
    valid: errors.length === 0,
    recipe: normalized,
    metrics: recipeMetrics(normalized, keyMap),
    errors
  };
}

module.exports = {
  normalizeRecipe,
  validateRecipe,
  recipeMetrics,
  productiveTensions
};
