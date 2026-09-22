'use strict';

const assert = require('node:assert/strict');
const recipeMemory = require('../src/services/cognitiveRecipeMemoryService');
const { applyCognitiveSynthesis } = require('../src/services/cognitiveSynthesisService');
const { composePortfolio } = require('../src/cognition/cognitivePortfolio');
const { COGNITIVE_KEYS } = require('../src/cognition/cognitiveKeyDefinitions');
const { phenotypeFromRecipe } = require('../src/services/cognitivePhenotypeService');

async function openDb() {
  const sqlite = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  return {
    run: (sql, ...args) => db.run(sql, ...args),
    all: (sql, ...args) => db.all(sql, ...args),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  };
}

function workerWith(recipe, agentId) {
  return { agentId, cognitiveRecipe: phenotypeFromRecipe(recipe) };
}

function dossierFor(agentId, report) {
  return { workerId: agentId, events: [{ payload: { evidenceReport: report } }] };
}

async function main() {
  const db = await openDb();

  // 1. Signal structurel : dossier utile = claims + tests
  assert.equal(recipeMemory.isUsefulDossier({ claims: ['c'], tests: ['t'] }), true);
  assert.equal(recipeMemory.isUsefulDossier({ claims: ['c'], tests: [] }), false);
  assert.equal(recipeMemory.isUsefulDossier(null), false);
  const gainTested = recipeMemory.dossierGain({ claims: ['a', 'b'], tests: ['t1'], uncertainties: ['u'] });
  const gainUntested = recipeMemory.dossierGain({ claims: ['a', 'b'], tests: [], uncertainties: [] });
  assert.ok(gainTested > gainUntested, 'tested claims must outweigh untested');

  // 2. recordMissionOutcome : upsert par (recette, contexte)
  const needs = ['complexity', 'category_reification', 'causal_uncertainty'];
  const portfolio = composePortfolio({ id: 'recipe.mem-test', needs, recipeCount: 3, options: { maxKeys: 3, maxCostWeight: 8 } });
  const workers = portfolio.recipes.map((recipe, i) => workerWith(recipe, `w-${i + 1}`));
  const dossiers = [
    dossierFor('w-1', { outcome: 'success', claims: ['cause identifiée'], tests: ['ablation'], uncertainties: [] }),
    dossierFor('w-2', { outcome: 'success', claims: ['topologie explicative'], tests: ['isolation'], uncertainties: ['latence'] }),
    dossierFor('w-3', { outcome: 'failed', claims: [], tests: [] })
  ];
  const plan = { cognitivePortfolio: { recipes: portfolio.recipes, metrics: portfolio.metrics, needs } };
  const ctx = { agentId: 'orch-mem', workers, autonomyPlan: plan, usable: dossiers, db };

  const synthesisResult = await applyCognitiveSynthesis(ctx);
  assert.ok(plan.cognitiveSynthesis.applied, 'synthesis must apply');

  // 3. Le registre contient une ligne par recette
  const rows = await db.all('SELECT recipe_id, runs, observed_gain, useful_dossiers FROM cognitive_recipe_performance');
  assert.equal(rows.length, 3);
  const byId = new Map(rows.map((row) => [row.recipe_id, row]));
  portfolio.recipes.forEach((recipe) => assert.ok(byId.has(recipe.id), `${recipe.id} recorded`));
  rows.forEach((row) => {
    assert.equal(row.runs, 1);
    assert.ok(Number(row.observed_gain) >= 0);
  });

  // 4. Deuxième mission, même contexte : agrégation (runs=2)
  await applyCognitiveSynthesis({ ...ctx, usable: dossiers });
  const rowsAfter = await db.all('SELECT recipe_id, runs FROM cognitive_recipe_performance');
  rowsAfter.forEach((row) => assert.equal(row.runs, 2, `${row.recipe_id} must aggregate runs`));

  // 5. performanceMap : gain moyen par run, format evolveRecipes
  const map = await recipeMemory.performanceMap(db);
  assert.equal(Object.keys(map).length, 3);
  portfolio.recipes.forEach((recipe) => assert.ok(typeof map[recipe.id] === 'number'));
  assert.ok(Object.values(map).every((score) => score >= 0));

  // 6. performanceMap par contexte : isolation
  const otherContext = await recipeMemory.performanceMap(db, { context: 'needs-that-never-occurred' });
  assert.equal(Object.keys(otherContext).length, 0);

  // 7. recordedRecipes : reconstitution des clés pour findCandidates
  const recorded = await recipeMemory.recordedRecipes(db);
  assert.equal(recorded.length, 3);
  recorded.forEach((recipe) => {
    assert.ok(Array.isArray(recipe.keys) && recipe.keys.length > 0);
    assert.ok(recipe.runs >= 1);
  });

  // 8. Bout-en-bout : le registre alimente la genèse
  const { findCandidates } = require('../src/cognition/cognitiveKeyGenesis');
  const performance = await recipeMemory.performanceMap(db);
  const candidates = findCandidates({ recipes: recorded, performance });
  // les recettes du portfolio divergent par construction — les paires
  // co-occurrentes dépendent des sélections ; le test vérifie seulement
  // que le pipeline ne casse pas avec des données réelles du registre
  assert.ok(Array.isArray(candidates));

  // 9. Sans db : no-op propre
  assert.deepEqual(await recipeMemory.performanceMap(null), {});
  assert.deepEqual(await recipeMemory.recordedRecipes(null), []);
  const noDb = await recipeMemory.recordMissionOutcome(null, { portfolio });
  assert.equal(noDb.recorded, 0);

  db.close();
  console.log(
    `Cognitive recipe memory tests passed (3 recipes recorded, runs aggregated, ` +
    `${Object.keys(map).length} performance scores exported to evolution/genesis).`
  );
}

main().catch((error) => { console.error(error); process.exit(1); });
