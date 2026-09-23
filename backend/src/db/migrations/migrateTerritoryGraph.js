'use strict';

/**
 * Migration 039 — graphe territorial (ADR 0034 D5).
 *
 * Le graphe est un INDEX DÉRIVÉ, pas une vérité fondamentale : il
 * doit pouvoir être totalement détruit et reconstruit depuis
 * repository + git + snapshots + telemetry + tests. Aucune autre
 * table ne dépend de ces tables avec FK stricte.
 *
 * territory_graph_nodes : file, directory, symbol (function, class...).
 * territory_graph_edges : CONTAINS, IMPORTS (+ extensions D7+).
 * node/edge ids déterministes → upserts idempotents, rebuild ==
 * incrémental vérifiable par test (invariant ADR Phase 35).
 */

async function migrateTerritoryGraph(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS territory_graph_nodes (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      kind TEXT NOT NULL
        CHECK (kind IN ('directory', 'file', 'symbol', 'test', 'dependency')),
      path TEXT NOT NULL,
      name TEXT,
      symbol_kind TEXT,
      hash TEXT,
      stale INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_territory
      ON territory_graph_nodes(territory_id, path);
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_kind
      ON territory_graph_nodes(territory_id, kind);

    CREATE TABLE IF NOT EXISTS territory_graph_edges (
      id TEXT PRIMARY KEY,
      territory_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      relation TEXT NOT NULL
        CHECK (relation IN ('CONTAINS', 'IMPORTS', 'TESTS', 'DEPENDS_ON')),
      target_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_graph_edges_source
      ON territory_graph_edges(territory_id, source_id);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_target
      ON territory_graph_edges(territory_id, target_id);
  `);
}

module.exports = { migrateTerritoryGraph };
