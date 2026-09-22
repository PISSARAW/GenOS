'use strict';

/**
 * Cognitive Key System — CognitivePortfolio (ADR 0033, point 5).
 *
 * Compose un ensemble de CognitiveRecipes maximisant la DISTANCE
 * COGNITIVE entre recettes, pas seulement la pertinence individuelle.
 *
 * Le problème du point 3 : le composer glouton est déterministe — N
 * workers avec les mêmes besoins reçoivent la même recette. Le point 4
 * l'a contourné par exclusion cumulative (séquentielle, aveugle à la
 * distance réelle). Le portfolio remplace cette heuristique par une
 * optimisation explicite :
 *
 *   max  Σ utility(recipe_i) + λ_div × distance_moyenne(paires)
 *        + λ_tension × tensions_inter_recettes
 *
 * Distance entre deux recettes = moyenne de trois distances Jaccard
 * (complément de la similarité) sur :
 *   - leurs opérations (que font-elles ?) ;
 *   - leurs familles (d'où viennent-elles ?) ;
 *   - les besoins qu'elles couvrent (à quoi servent-elles ?).
 *
 * Tensions inter-recettes : paires de clés en conflit déclaré situées
 * dans deux recettes DIFFÉRENTES — deux workers tenant des positions
 * incompatibles sur le même problème (matière du point 6).
 *
 * Algorithme : glouton par recette — chaque recette suivante compose
 * avec un bonus au score de sélection pour les clés qui augmentent la
 * distance aux recettes déjà fixées. Déterministe, sans LLM.
 */

const { COGNITIVE_KEYS } = require('./cognitiveKeyDefinitions');
const { composeRecipe } = require('./cognitiveComposer');

const DEFAULTS = {
  maxKeys: 4,
  maxCostWeight: 8,
  diversityWeight: 1.0,
  tensionWeight: 0.5
};

function jaccardDistance(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  a.forEach((value) => {
    if (b.has(value)) intersection += 1;
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : 1 - intersection / union;
}

function recipeSets(recipe, keyMap) {
  const keys = recipe.keys.map((keyId) => keyMap.get(keyId)).filter(Boolean);
  return {
    operations: keys.map((key) => key.operation),
    families: keys.map((key) => key.family || 'unclassified'),
    needs: [...new Set(keys.flatMap((key) => key.usefulWhen))]
  };
}

/**
 * Distance cognitive paire-à-paire : moyenne des trois distances
 * Jaccard (opérations, familles, besoins).
 */
function recipeDistance(recipeA, recipeB, keyMap) {
  const setsA = recipeSets(recipeA, keyMap);
  const setsB = recipeSets(recipeB, keyMap);
  return (
    jaccardDistance(setsA.operations, setsB.operations) +
    jaccardDistance(setsA.families, setsB.families) +
    jaccardDistance(setsA.needs, setsB.needs)
  ) / 3;
}

function crossTensions(recipes, keyMap) {
  const tensions = [];
  recipes.forEach((recipe, index) => {
    recipe.keys.forEach((keyId) => {
      const key = keyMap.get(keyId);
      if (!key) return;
      key.conflictsWith.forEach((otherId) => {
        recipes.slice(index + 1).forEach((other, otherIndex) => {
          if (other.keys.includes(otherId)) {
            tensions.push({
              a: { recipe: recipe.id, key: keyId },
              b: { recipe: other.id, key: otherId }
            });
          }
        });
      });
    });
  });
  return tensions;
}

function portfolioMetrics(recipes, keyMap) {
  const distances = [];
  for (let i = 0; i < recipes.length; i += 1) {
    for (let j = i + 1; j < recipes.length; j += 1) {
      distances.push(recipeDistance(recipes[i], recipes[j], keyMap));
    }
  }
  const meanDistance = distances.length
    ? distances.reduce((sum, value) => sum + value, 0) / distances.length
    : 0;
  const minDistance = distances.length ? Math.min(...distances) : 0;
  return {
    recipeCount: recipes.length,
    meanPairwiseDistance: Number(meanDistance.toFixed(4)),
    minPairwiseDistance: Number(minDistance.toFixed(4)),
    pairwiseDistances: distances.map((value) => Number(value.toFixed(4))),
    crossTensions: crossTensions(recipes, keyMap)
  };
}

function attributeBias(carriers) {
  if (carriers === 0) return 1;
  return 1 / (1 + carriers);
}

/**
 * Bonus de diversité pour une clé candidate : pénalité décroissante
 * pour les opérations/familles déjà présentes dans les recettes
 * précédentes, plafonnée par l'utilité de la clé. Injecté dans la
 * sélection gloutonne du composer (via options.diversityBias).
 *
 * Cumulatif : la nième réutilisation d'une opération rapporte moins
 * que la première. Un bias purement binaire ferait converger les
 * recettes paires/impaires vers le même optimum local.
 *
 * Plafonné par l'utilité : une clé sans pertinence pour les besoins ne
 * reçoit pas de bonus — sinon le portfolio fabrique des recettes
 * décoratives (diverses mais inutiles).
 */
function diversityBiasFor({ key, fixedRecipes, keyMap, weight, needs }) {
  if (fixedRecipes.length === 0) return 0;
  if (!keyUtilityForNeeds(key, needs)) return 0;
  const sets = fixedRecipes.map((recipe) => recipeSets(recipe, keyMap));
  const opCarriers = sets.filter((set) => set.operations.includes(key.operation)).length;
  const family = key.family || 'unclassified';
  const familyCarriers = sets.filter((set) => set.families.includes(family)).length;
  return weight * (attributeBias(opCarriers) + attributeBias(familyCarriers)) / 2;
}

function keyUtilityForNeeds(key, needs) {
  if (!needs || needs.length === 0) return true;
  return needs.some((need) => key.usefulWhen.includes(need));
}

function recipeIdentity(input, index) {
  return {
    id: input.id ? `${input.id}-${index + 1}` : `recipe.portfolio-${index + 1}`,
    label: input.label ? `${input.label} #${index + 1}` : `Portfolio recipe #${index + 1}`
  };
}

function composePortfolio(input) {
  const keys = input.keys || COGNITIVE_KEYS;
  const keyMap = new Map(keys.map((key) => [key.id, key]));
  const recipeCount = Math.max(1, Math.floor(input.recipeCount || 1));
  const weights = { ...DEFAULTS, ...(input.options || {}) };

  const recipes = [];
  for (let index = 0; index < recipeCount; index += 1) {
    // Chaque recette repart d'une couverture vierge : l'utilité est
    // intra-recette (couvrir les besoins de la mission dans CETTE
    // recette), la diversité est inter-recettes (bias sur les
    // opérations/familles déjà fixées par les recettes précédentes).
    const fixedRecipes = recipes.map((recipe) => ({ ...recipe }));
    const biasArgs = { fixedRecipes, keyMap, weight: weights.diversityWeight, needs: input.needs || [] };
    const composition = composeRecipe({
      ...recipeIdentity(input, index),
      needs: input.needs || [],
      keys,
      options: {
        maxKeys: weights.maxKeys,
        maxCostWeight: weights.maxCostWeight,
        diversityBias: (key) => diversityBiasFor({ ...biasArgs, key })
      }
    });
    if (composition.valid) {
      recipes.push({ ...composition.recipe, metrics: composition.metrics });
    }
  }

  return {
    recipes,
    metrics: portfolioMetrics(recipes, keyMap),
    needs: input.needs || []
  };
}

module.exports = {
  composePortfolio,
  portfolioMetrics,
  recipeDistance,
  crossTensions,
  jaccardDistance
};
