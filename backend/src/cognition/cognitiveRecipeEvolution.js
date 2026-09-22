'use strict';

/**
 * Cognitive Key System — évolution NCE des recettes (ADR 0033, point 9).
 *
 * Mutation, recombinaison et exaptation des CognitiveRecipes efficaces,
 * dans l'esprit NCE : « Nature is not a database of solutions. Nature
 * is a collection of search processes. » Les recettes ne sont pas une
 * base de réponses — elles évoluent.
 *
 * Trois opérateurs, tous déterministes et sans LLM :
 *
 *  - MUTATION : remplacer une clé d'une recette par une clé compatible
 *    non utilisée (compatibleWith), ou en permuter l'ordre. Petite
 *    variation locale, la recette reste dans son voisinage.
 *
 *  - RECOMBINAISON : croiser deux recettes parentes — chaque enfant
 *    hérite du prefix d'un parent et du suffixe de l'autre, aux points
 *    de croisement qui préservent la validité (clés uniques, budget).
 *
 *  - EXAPTATION : réutiliser une recette performante dans un domaine
 *    (profil de besoins) différent de celui où elle a été validée.
 *    La recette garde ses clés ; seuls l'objectif et la provenance
 *    changent. C'est le mécanisme décrit par l'utilisateur : « R18
 *    avait été inventée pour analyser une architecture logicielle.
 *    Quelques semaines plus tard : R18 pourrait-elle aider à analyser
 *    une théorie scientifique ? »
 *
 * Sélection : les recettes candidates proviennent d'un registre de
 * performance (quelles recettes ont produit des dossiers utiles) —
 * en v1 ce registre est injecté par l'appelant ; le service ne
 * devine pas la performance, il l'hérite.
 *
 * Toute recette produite est revalidée par validateRecipe : un mutant
 * invalide n'est jamais retourné (l'évolution ne court-circuite pas
 * le contrat).
 */

const { validateRecipe } = require('./cognitiveRecipeService');

const MAX_MUTATION_ATTEMPTS = 8;

function keyMapOf(keys) {
  return new Map(keys.map((key) => [key.id, key]));
}

/**
 * MUTATION — remplace une clé par une compatible non utilisée, ou
 * permute deux positions. Retourne null si aucune variation valide.
 */
function mutateRecipe(recipe, keys, options = {}) {
  const keyMap = keyMapOf(keys);
  const maxKeys = options.maxKeys || recipe.keys.length;
  const maxCostWeight = options.maxCostWeight || Infinity;

  for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
    const variant = mutationVariant(recipe, keyMap, maxKeys);
    if (!variant) continue;
    const validation = validateRecipe({ ...recipe, keys: variant }, keys);
    if (validation.valid && costWeightOf(variant, keyMap) <= maxCostWeight) {
      return withOrigin(validation.recipe, { operator: 'mutation', parent: recipe.id });
    }
  }
  return null;
}

function mutationVariant(recipe, keyMap, maxKeys) {
  if (recipe.keys.length >= 2 && Math.random() < 0.5) {
    const swapped = [...recipe.keys];
    const i = Math.floor(Math.random() * swapped.length);
    const j = Math.floor(Math.random() * swapped.length);
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    return swapped;
  }
  const replaceIndex = Math.floor(Math.random() * recipe.keys.length);
  const currentKey = keyMap.get(recipe.keys[replaceIndex]);
  if (!currentKey || !currentKey.compatibleWith || currentKey.compatibleWith.length === 0) return null;
  const candidates = currentKey.compatibleWith.filter((id) => !recipe.keys.includes(id) && keyMap.has(id));
  if (candidates.length === 0) return null;
  const replacement = candidates[Math.floor(Math.random() * candidates.length)];
  const variant = [...recipe.keys];
  variant[replaceIndex] = replacement;
  return variant.slice(0, maxKeys);
}

function costWeightOf(keyIds, keyMap) {
  const weights = { low: 1, medium: 2, high: 3 };
  return keyIds.reduce((total, id) => total + (weights[(keyMap.get(id) || {}).cost] || 0), 0);
}

/**
 * RECOMBINAISON — croise deux parents. Chaque enfant hérite d'un
 * préfixe du parent A et d'un suffixe du parent B (et inversement),
 * sans doublon de clé. Retourne les enfants valides.
 */
function recombineRecipes(parentA, parentB, keys) {
  if (!parentA || !parentB) return [];
  const children = [];
  const cutA = crossoverPoint(parentA);
  const cutB = crossoverPoint(parentB);
  children.push(mergeKeySequences({ prefix: parentA.keys.slice(0, cutA), suffix: parentB.keys.slice(cutB), parentA, parentB, keys, childNumber: 1 }));
  children.push(mergeKeySequences({ prefix: parentB.keys.slice(0, cutB), suffix: parentA.keys.slice(cutA), parentB, parentA, keys, childNumber: 2 }));
  return children.filter(Boolean);
}

function crossoverPoint(parent) {
  if (parent.keys.length < 2) return parent.keys.length;
  return 1 + Math.floor(Math.random() * (parent.keys.length - 1));
}

function mergeKeySequences({ prefix, suffix, parentA, parentB, keys, childNumber }) {
  const merged = [];
  const seen = new Set();
  [...prefix, ...suffix].forEach((keyId) => {
    if (!seen.has(keyId)) {
      seen.add(keyId);
      merged.push(keyId);
    }
  });
  if (merged.length === 0) return null;
  const child = {
    id: `recipe.recombined-${childNumber}`,
    label: `Recombination of ${parentA.id} × ${parentB.id}`,
    keys: merged,
    ordering: [],
    objective: parentA.objective || null
  };
  const validation = validateRecipe(child, keys);
  if (!validation.valid) return null;
  return withOrigin(validation.recipe, { operator: 'recombination', parents: [parentA.id, parentB.id] });
}

function withOrigin(recipe, origin) {
  return { ...recipe, origin };
}

/**
 * EXAPTATION — réutilise une recette validée sur un NOUVEAU profil de
 * besoins. Les clés sont conservées telles quelles : c'est le transfert
 * qui est testé, pas une recomposition. La recette exaptée échoue à la
 * validation si aucune de ses clés ne couvre les nouveaux besoins —
 * une exaptation sans aucune pertinence est décorative.
 */
function exaptRecipe(recipe, targetNeeds, keys) {
  if (!recipe) return null;
  const keyMap = keyMapOf(keys);
  const covered = recipe.keys.some((keyId) => {
    const key = keyMap.get(keyId);
    return key && key.usefulWhen.some((need) => targetNeeds.includes(need));
  });
  if (!covered) return null;
  const exapted = {
    ...recipe,
    id: `${recipe.id}-exapted`,
    label: `${recipe.label} (exapted)`,
    objective: { ...(recipe.objective || {}), increase: targetNeeds }
  };
  const validation = validateRecipe(exapted, keys);
  if (!validation.valid) return null;
  return withOrigin(validation.recipe, {
    operator: 'exaptation',
    parent: recipe.id,
    originalNeeds: (recipe.objective && recipe.objective.increase) || []
  });
}

/**
 * Étape d'évolution complète : les recettes performantes (selon le
 * registre injecté) subissent mutation/recombinaison, et la meilleure
 * est exaptée vers les nouveaux besoins si fournis.
 */
function evolveRecipes({ recipes, performance, keys, targetNeeds, options }) {
  const performed = (recipes || []).filter((recipe) => performance && performance[recipe.id] > 0);
  if (performed.length === 0) return { mutants: [], recombinants: [], exaptations: [] };

  const mutants = performed
    .map((recipe) => mutateRecipe(recipe, keys, options))
    .filter(Boolean);

  const recombinants = [];
  for (let i = 0; i < performed.length; i += 1) {
    for (let j = i + 1; j < performed.length; j += 1) {
      recombinants.push(...recombineRecipes(performed[i], performed[j], keys));
    }
  }

  const exaptations = [];
  if (targetNeeds && targetNeeds.length > 0) {
    const best = performed.slice().sort((a, b) => performance[b.id] - performance[a.id])[0];
    const exapted = exaptRecipe(best, targetNeeds, keys);
    if (exapted) exaptations.push(exapted);
  }

  return { mutants, recombinants, exaptations };
}

module.exports = {
  mutateRecipe,
  recombineRecipes,
  exaptRecipe,
  evolveRecipes
};
