'use strict';

/**
 * Migration 060 — Counterfactual Runtime tables (ADR 0042).
 *
 * counterfactual_worlds : candidate worlds forked from production state,
 * each holding an isolated snapshot with typed interventions.
 *
 * counterfactual_experiments : bounded experiments run against each world,
 * with resource/time guards and reproducibility receipts.
 *
 * counterfactual_results : causal effect comparison across worlds,
 * promoting the best future back to production via Morphogenesis.
 *
 * Supports 7 counterfactual axes:
 *   strategy, capability, DNA, plasmid, communication_policy,
 *   relationship, worker_allocation
 */

async function migrateCounterfactualTables(db) {

  // ── counterfactual_worlds ──────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS counterfactual_worlds (
      id TEXT PRIMARY KEY,
      parent_world_id TEXT,
      base_snapshot_id TEXT NOT NULL,
      label TEXT NOT NULL,
      counterfactual_type TEXT NOT NULL
        CHECK (counterfactual_type IN (
          'strategy', 'capability', 'dna', 'plasmid',
          'communication_policy', 'relationship', 'worker_allocation'
        )),
      intervention_json TEXT NOT NULL DEFAULT '{}',
      vfs_namespace TEXT NOT NULL,
      blast_radius_risk INTEGER NOT NULL DEFAULT 0,
      causal_locus TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sealed', 'running', 'evaluated', 'promoted', 'discarded')),
      expected_benefit REAL DEFAULT 0.0,
      created_by TEXT NOT NULL DEFAULT 'counterfactual_planner',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sealed_at DATETIME,
      promoted_at DATETIME,
      discarded_at DATETIME,
      FOREIGN KEY (parent_world_id) REFERENCES counterfactual_worlds(id) ON DELETE SET NULL,
      FOREIGN KEY (base_snapshot_id) REFERENCES agent_state_snapshots(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cf_worlds_type_status
      ON counterfactual_worlds(counterfactual_type, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cf_worlds_parent
      ON counterfactual_worlds(parent_world_id);
  `);

  // ── counterfactual_experiments ─────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS counterfactual_experiments (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      experiment_label TEXT NOT NULL,
      protocol_json TEXT NOT NULL DEFAULT '{}',
      budget_json TEXT NOT NULL DEFAULT '{}',
      metrics_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'running', 'completed', 'failed', 'aborted')),
      started_at DATETIME,
      completed_at DATETIME,
      duration_ms INTEGER,
      abort_reason TEXT,
      receipt_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (world_id) REFERENCES counterfactual_worlds(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cf_experiments_world
      ON counterfactual_experiments(world_id, status, created_at DESC);
  `);

  // ── counterfactual_results ─────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS counterfactual_results (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      world_id TEXT NOT NULL,
      baseline_world_id TEXT,
      metric_name TEXT NOT NULL,
      metric_value REAL NOT NULL,
      baseline_value REAL,
      delta REAL,
      normalized_effect REAL,
      confidence REAL DEFAULT 0.0,
      rank INTEGER,
      is_winner INTEGER DEFAULT 0,
      promotion_receipt_json TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (experiment_id) REFERENCES counterfactual_experiments(id) ON DELETE CASCADE,
      FOREIGN KEY (world_id) REFERENCES counterfactual_worlds(id) ON DELETE CASCADE,
      FOREIGN KEY (baseline_world_id) REFERENCES counterfactual_worlds(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cf_results_experiment
      ON counterfactual_results(experiment_id, rank);
    CREATE INDEX IF NOT EXISTS idx_cf_results_world
      ON counterfactual_results(world_id, metric_name);
    CREATE INDEX IF NOT EXISTS idx_cf_results_winner
      ON counterfactual_results(is_winner, metric_name) WHERE is_winner = 1;
  `);

  // ── World lineage graph edges for counterfactual DAG ───────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS counterfactual_lineage_edges (
      id TEXT PRIMARY KEY,
      parent_world_id TEXT NOT NULL,
      child_world_id TEXT NOT NULL,
      edge_type TEXT NOT NULL DEFAULT 'intervention'
        CHECK (edge_type IN ('intervention', 'promotion', 'mutation', 'cross', 'rollback')),
      intervention_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_world_id) REFERENCES counterfactual_worlds(id) ON DELETE CASCADE,
      FOREIGN KEY (child_world_id) REFERENCES counterfactual_worlds(id) ON DELETE CASCADE,
      UNIQUE(parent_world_id, child_world_id, edge_type)
    );
    CREATE INDEX IF NOT EXISTS idx_cf_lineage_parent
      ON counterfactual_lineage_edges(parent_world_id);
    CREATE INDEX IF NOT EXISTS idx_cf_lineage_child
      ON counterfactual_lineage_edges(child_world_id);
  `);

}

module.exports = { migrateCounterfactualTables };
