'use strict';

/**
 * Cognitive Key System — registre de performance persistant (ADR 0033,
 * suite des points 9/10).
 *
 * Pont entre la synthèse cognitive (ce que les recettes ont produit)
 * et l'évolution/genèse (ce qui mérite de muter/recombiner/être admis).
 *
 * Deux directions :
 *  - recordMissionOutcome : appelé à la fin d'une mission par la
 *    barrier de synthèse — enregistre, par recette, si son worker a
 *    produit un dossier utile (claims/tests) et le gain observé ;
 *  - performanceMap : lit le registre agrégé et l'exporte au format
 *    attendu par evolveRecipes / findCandidates ({recipeId: score}).
 *
 * Le gain observé en v1 est STRUCTUREL (pas une note LLM) : un dossier
 * est utile s'il a des claims ET des tests ; le gain agrège la
 * profondeur des positions réconciliées issues de la synthèse. Ce
 * n'est pas la qualité finale des réponses — c'est un signal honnête,
 * mesurable sans juge externe, que les runs runtime du benchmark
 * affineront.
 */

const TABLE = 'cognitive_recipe_performance';

function ensureTable(db) {
  return db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      recipe_id TEXT NOT NULL,
      context TEXT NOT NULL,
      runs INTEGER NOT NULL DEFAULT 0,
      observed_gain REAL NOT NULL DEFAULT 0,
      useful_dossiers INTEGER NOT NULL DEFAULT 0,
      keys_json TEXT NOT NULL DEFAULT '[]',
      last_evidence_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (recipe_id, context)
    );
  `);
}

function isUsefulDossier(position) {
  if (!position) return false;
  const claims = Array.isArray(position.claims) ? position.claims.length : 0;
  const tests = Array.isArray(position.tests) ? position.tests.length : 0;
  return claims > 0 && tests > 0;
}

function dossierGain(position) {
  if (!isUsefulDossier(position)) return 0;
  const claims = position.claims.length;
  const tests = position.tests.length;
  const uncertainties = Array.isArray(position.uncertainties) ? position.uncertainties.length : 0;
  // Signal structurel : claims testés > claims non testés ; les
  // uncertainties déclarées comptent (honnêteté épistémique).
  return Number((claims + 2 * tests + 0.5 * uncertainties).toFixed(4));
}

function contextKey(needs) {
  return (needs || []).slice().sort().join(',');
}

/**
 * Enregistre l'issue d'une mission pour chaque recette du portfolio.
 * Appelé depuis applyCognitiveSynthesis quand la synthèse a eu lieu.
 */
async function recordMissionOutcome(db, { portfolio, synthesis, context }) {
  if (!db || !portfolio || !Array.isArray(portfolio.recipes)) return { recorded: 0 };
  await ensureTable(db);
  const ctx = context || contextKey(portfolio.needs);
  const positionsByRecipe = positionsIndexedByRecipe(synthesis);
  let recorded = 0;
  for (const recipe of portfolio.recipes) {
    const position = positionsByRecipe.get(recipe.id) || null;
    const useful = isUsefulDossier(position) ? 1 : 0;
    const gain = dossierGain(position);
    await db.run(
      `INSERT INTO ${TABLE} (recipe_id, context, runs, observed_gain, useful_dossiers, keys_json, last_evidence_json, updated_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(recipe_id, context) DO UPDATE SET
         runs = runs + 1,
         observed_gain = observed_gain + excluded.observed_gain,
         useful_dossiers = useful_dossiers + excluded.useful_dossiers,
         keys_json = excluded.keys_json,
         last_evidence_json = excluded.last_evidence_json,
         updated_at = datetime('now')`,
      recipe.id, ctx, gain, useful,
      JSON.stringify(recipe.keys || []),
      JSON.stringify({ position, at: new Date().toISOString() })
    );
    recorded += 1;
  }
  return { recorded, context: ctx };
}

function positionsIndexedByRecipe(synthesis) {
  const map = new Map();
  const confrontations = (synthesis && synthesis.confrontations) || [];
  confrontations.forEach((confrontation) => {
    ['a', 'b'].forEach((side) => {
      const position = confrontation.positions && confrontation.positions[side];
      const recipeId = position && position.recipeId;
      if (recipeId && !map.has(recipeId)) map.set(recipeId, position);
    });
  });
  return map;
}

/**
 * Exporte le registre au format performanceMap attendu par
 * evolveRecipes et findCandidates : {recipeId: score}.
 * Le score = gain moyen par run (pas le total — une recette testée
 * 100 fois avec un gain cumulé élevé mais moyen faible ne doit pas
 * dominer une recette constamment utile).
 */
async function performanceMap(db, { context } = {}) {
  if (!db) return {};
  await ensureTable(db);
  const rows = context
    ? await db.all(`SELECT recipe_id, runs, observed_gain FROM ${TABLE} WHERE context = ?`, context)
    : await db.all(`SELECT recipe_id, runs, observed_gain FROM ${TABLE}`);
  const map = {};
  rows.forEach((row) => {
    const runs = Math.max(1, Number(row.runs) || 1);
    map[row.recipe_id] = Number(((Number(row.observed_gain) || 0) / runs).toFixed(4));
  });
  return map;
}

/**
 * Recettes récentes avec leurs clés (pour findCandidates) : reconstruit
 * des pseudo-recettes depuis le registre — les clés sont persistées,
 * la recette est donc reconstituable sans le portfolio d'origine.
 */
async function recordedRecipes(db, { context, minRuns = 1 } = {}) {
  if (!db) return [];
  await ensureTable(db);
  const rows = context
    ? await db.all(`SELECT recipe_id, runs, keys_json FROM ${TABLE} WHERE context = ? AND runs >= ?`, context, minRuns)
    : await db.all(`SELECT recipe_id, runs, keys_json FROM ${TABLE} WHERE runs >= ?`, minRuns);
  return rows.map((row) => ({
    id: row.recipe_id,
    runs: Number(row.runs) || 0,
    keys: safeParse(row.keys_json)
  }));
}

function safeParse(text) {
  try {
    const parsed = JSON.parse(text || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

module.exports = {
  recordMissionOutcome,
  performanceMap,
  recordedRecipes,
  isUsefulDossier,
  dossierGain,
  contextKey
};
