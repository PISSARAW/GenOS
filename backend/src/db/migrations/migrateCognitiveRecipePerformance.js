'use strict';

/**
 * Migration 036 — registre de performance des CognitiveRecipes.
 *
 * Table cognitive_recipe_performance :
 *  - une ligne par (recette, contexte de mission) agrégée : runs,
 *    gain cumulé observé, dossiers utiles ;
 *  - clé primaire composite (recipe_id, context) — les performances
 *    sont par domaine d'usage, pas globales (une recette peut être
 *    excellente en debugging, inutile en analyse scientifique) ;
 *  - updated_at sur upsert — le registre vit avec les missions.
 *
 * Ce registre alimente :
 *  - l'évolution NCE (point 9) : performance par recette ;
 *  - la genèse (point 10) : co-occurrences dans les recettes
 *    performantes ;
 *  - le benchmark d'ablation (point 7) : mesure de sortie persistée.
 */

async function migrateCognitiveRecipePerformance(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cognitive_recipe_performance (
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
    CREATE INDEX IF NOT EXISTS idx_cognitive_recipe_perf_recipe
      ON cognitive_recipe_performance(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_cognitive_recipe_perf_context
      ON cognitive_recipe_performance(context);
  `);
}

module.exports = { migrateCognitiveRecipePerformance };
