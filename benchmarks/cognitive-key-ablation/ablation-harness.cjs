'use strict';

/**
 * Cognitive Key System — benchmark d'ablation A-F (ADR 0033, point 7).
 *
 * Protocole défini par l'utilisateur :
 *   A — 3 workers identiques (même prompt, pas de cognition différenciée)
 *   B — 3 rôles métier différents (A-Team standard)
 *   C — 3 prompts « philosophiques » (mention doctrine directe)
 *   D — 3 CognitiveRecipes optimisées pour la pertinence seule
 *   E — 3 CognitiveRecipes optimisées pour pertinence + diversité
 *   F — E + recombinaison/exaptation NCE (point 9, non implémenté —
 *       le bras est défini mais rapporté comme non mesurable)
 *
 * Même modèle, mêmes tokens, mêmes outils, mêmes problèmes.
 *
 * Ce harness mesure la COUCHE STRUCTURELLE (sans LLM) : pour chaque
 * bras, ce que le dispatch produit réellement — recettes, distance
 * cognitive, couverture des besoins, tensions exploitables. La mesure
 * de la qualité des SORTIES (résultats des workers) requiert des runs
 * runtime complets et appartient à une exécution ultérieure ; le
 * harness expose les métriques qui permettront de la corréler.
 *
 * Métriques par bras :
 *   - recipeCount, distinctRecipes : diversité effective du dispatch
 *   - meanPairwiseDistance / minPairwiseDistance : distance cognitive
 *   - unionNeedsCoverage : fraction des besoins couverte par au moins
 *     une recette (couverture d'union — l'équipe, pas le worker)
 *   - totalKeyReuse : redondance (clés répétées entre recettes)
 *   - crossTensions : tensions inter-workers exploitables
 */

const { COGNITIVE_KEYS } = require('../../backend/src/cognition/cognitiveKeyDefinitions');
const { composePortfolio } = require('../../backend/src/cognition/cognitivePortfolio');
const { composeRecipe } = require('../../backend/src/cognition/cognitiveComposer');
const { inferCognitiveNeeds } = require('../../backend/src/services/cognitivePhenotypeService');

const KEY_MAP = new Map(COGNITIVE_KEYS.map((key) => [key.id, key]));
const WORKER_COUNT = 3;

// ── Problèmes du benchmark ─────────────────────────────────────
// Textes de mission qui déclenchent l'inférence de besoins sur des
// vocabulaires distincts (causalité, émergence, couplage).
const PROBLEMS = [
  {
    id: 'P1-scaling-degradation',
    mission: 'Diagnose why this multi-agent system degrades as workers scale. The causal uncertainty persists and a representation lock in blocks debugging: separate observed regularity from cause before concluding.'
  },
  {
    id: 'P2-emergence-verification',
    mission: 'Evaluate whether the observed global behavior is real emergence or labeling. The complexity of interactions demands isolation tests; guard against category reification and weak evidence.'
  },
  {
    id: 'P3-hidden-coupling',
    mission: 'Review this architecture for hidden coupling and category reification. Map dependencies between artifacts, confront reduction with emergence detection, and watch for confirmation bias risk and complexity.'
  }
];

// ── Bras du protocole ──────────────────────────────────────────

/** A — workers identiques : une seule recette (ou aucune), dupliquée. */
function armA(needs) {
  const composition = composeRecipe({
    id: 'recipe.ablation-a',
    label: 'Identical workers',
    needs,
    options: { maxKeys: 4, maxCostWeight: 8 }
  });
  if (!composition.valid) return [];
  return Array.from({ length: WORKER_COUNT }, () => composition.recipe);
}

/** B — rôles métier : pas de recettes cognitives (diversité de rôle). */
function armB() {
  return Array.from({ length: WORKER_COUNT }, () => null);
}

/** C — prompts philosophiques : la doctrine est mentionnée dans le prompt,
 *  pas extraite en opérations. Structurellement équivalent à B (aucune
 *  recette), la différence vit dans le texte du prompt. */
function armC() {
  return armB();
}

/** D — pertinence seule : composer N fois SANS bias de diversité. */
function armD(needs) {
  return Array.from({ length: WORKER_COUNT }, (_, index) => {
    const composition = composeRecipe({
      id: `recipe.ablation-d-${index + 1}`,
      label: `Relevance-only #${index + 1}`,
      needs,
      options: { maxKeys: 4, maxCostWeight: 8 }
    });
    return composition.valid ? composition.recipe : null;
  }).filter(Boolean);
}

/** E — pertinence + diversité : le CognitivePortfolio complet. */
function armE(needs) {
  const portfolio = composePortfolio({
    id: 'recipe.ablation-e',
    label: 'QD portfolio',
    needs,
    recipeCount: WORKER_COUNT,
    options: { maxKeys: 4, maxCostWeight: 8 }
  });
  return portfolio.recipes;
}

/** F — E + NCE (point 9) : non implémenté, mesuré comme tel. */
function armF(needs) {
  return { implemented: false, recipes: armE(needs) };
}

// ── Mesure ─────────────────────────────────────────────────────

function recipesOf(armResult) {
  if (Array.isArray(armResult)) return armResult.filter(Boolean);
  if (armResult && Array.isArray(armResult.recipes)) return armResult.recipes;
  return [];
}

function distinctRecipes(recipes) {
  return new Set(recipes.map((recipe) => recipe.keys.join('|'))).size;
}

function unionCoverage(recipes, needs) {
  if (needs.length === 0) return 1;
  const covered = new Set(recipes.flatMap((recipe) => recipe.keys
    .flatMap((keyId) => (KEY_MAP.get(keyId) || { usefulWhen: [] }).usefulWhen)));
  const hit = needs.filter((need) => covered.has(need)).length;
  return Number((hit / needs.length).toFixed(4));
}

function totalKeyReuse(recipes) {
  const counts = new Map();
  recipes.forEach((recipe) => recipe.keys.forEach((keyId) => {
    counts.set(keyId, (counts.get(keyId) || 0) + 1);
  }));
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function portfolioDistance(recipes) {
  if (recipes.length < 2) return { mean: 0, min: 0 };
  const distances = [];
  for (let i = 0; i < recipes.length; i += 1) {
    for (let j = i + 1; j < recipes.length; j += 1) {
      const recipeA = recipes[i];
      const recipeB = recipes[j];
      const opsA = new Set(recipeA.keys.map((id) => (KEY_MAP.get(id) || {}).operation).filter(Boolean));
      const opsB = new Set(recipeB.keys.map((id) => (KEY_MAP.get(id) || {}).operation).filter(Boolean));
      let intersection = 0;
      opsA.forEach((op) => { if (opsB.has(op)) intersection += 1; });
      const union = opsA.size + opsB.size - intersection;
      distances.push(union === 0 ? 0 : 1 - intersection / union);
    }
  }
  return {
    mean: Number((distances.reduce((s, v) => s + v, 0) / distances.length).toFixed(4)),
    min: Number(Math.min(...distances).toFixed(4))
  };
}

function crossTensionCount(recipes) {
  let count = 0;
  recipes.forEach((recipe, index) => {
    recipe.keys.forEach((keyId) => {
      const key = KEY_MAP.get(keyId);
      if (!key) return;
      key.conflictsWith.forEach((otherId) => {
        recipes.slice(index + 1).forEach((other) => {
          if (other.keys.includes(otherId)) count += 1;
        });
      });
    });
  });
  return count;
}

function measureArm(armResult, needs) {
  const recipes = recipesOf(armResult);
  const distance = portfolioDistance(recipes);
  return {
    recipeCount: recipes.length,
    distinctRecipes: distinctRecipes(recipes),
    meanPairwiseDistance: distance.mean,
    minPairwiseDistance: distance.min,
    unionNeedsCoverage: unionCoverage(recipes, needs),
    totalKeyReuse: totalKeyReuse(recipes),
    crossTensions: crossTensionCount(recipes),
    nceImplemented: armResult && armResult.implemented === false ? false : undefined
  };
}

// ── Exécution ──────────────────────────────────────────────────

function runAblation() {
  const results = PROBLEMS.map((problem) => {
    const needs = inferCognitiveNeeds(problem.mission);
    const arms = {
      A: armA(needs),
      B: armB(),
      C: armC(),
      D: armD(needs),
      E: armE(needs),
      F: armF(needs)
    };
    const measurements = {};
    Object.entries(arms).forEach(([arm, result]) => {
      measurements[arm] = measureArm(result, needs);
    });
    return { problem: problem.id, needs, measurements };
  });
  return { protocol: 'cognitive-ablation-A-F', workerCount: WORKER_COUNT, results };
}

function summarize(ablation) {
  const arms = ['A', 'B', 'C', 'D', 'E', 'F'];
  const summary = {};
  arms.forEach((arm) => {
    const rows = ablation.results.map((result) => result.measurements[arm]);
    const avg = (field) => Number((rows.reduce((s, r) => s + (r[field] || 0), 0) / rows.length).toFixed(4));
    summary[arm] = {
      distinctRecipes: avg('distinctRecipes'),
      meanPairwiseDistance: avg('meanPairwiseDistance'),
      unionNeedsCoverage: avg('unionNeedsCoverage'),
      totalKeyReuse: avg('totalKeyReuse'),
      crossTensions: avg('crossTensions'),
      nceImplemented: rows[0].nceImplemented
    };
  });
  return summary;
}

module.exports = { runAblation, summarize, measureArm, PROBLEMS };

if (require.main === module) {
  const ablation = runAblation();
  const summary = summarize(ablation);
  console.log(JSON.stringify({
    protocol: ablation.protocol,
    workerCount: ablation.workerCount,
    problems: ablation.results.map((r) => ({ id: r.problem, needs: r.needs.length })),
    summary
  }, null, 2));
}
