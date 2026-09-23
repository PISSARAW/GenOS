'use strict';

/**
 * P1 + P2 — Analytics & Planning
 *
 * P1: Vue d'évolution, santé des territoires,hybrid search status
 * P2: Fenêtres temporelles (LAG/LEAD), registre de capacités, query planner
 */

async function createAnalyticsViews(db) {
  // Évolution temporelle des métriques agent avec fenêtre glissante
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_agent_telemetry_trend AS
SELECT
    agent_id,
    event_type,
    severity,
    created_at,
    json_extract(payload_json, '$.tokens') AS tokens,
    json_extract(payload_json, '$.costUsd') AS cost_usd,
    json_extract(payload_json, '$.latencyMs') AS latency_ms,
    LAG(json_extract(payload_json, '$.tokens')) OVER (
        PARTITION BY agent_id, event_type ORDER BY created_at
    ) AS prev_tokens,
    LAG(json_extract(payload_json, '$.latencyMs')) OVER (
        PARTITION BY agent_id, event_type ORDER BY created_at
    ) AS prev_latency_ms
FROM telemetry_events
WHERE json_extract(payload_json, '$.tokens') IS NOT NULL;
`);

  // Santé des territoires daemon : activité récente et couverture
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_daemon_territory_health AS
SELECT
    t.id AS territory_id,
    t.repo_identity AS name,
    t.state AS status,
    COUNT(DISTINCT de.id) FILTER (WHERE de.created_at >= datetime('now', '-1 hour')) AS events_last_hour,
    COUNT(DISTINCT df.id) AS total_findings,
    COUNT(DISTINCT df.id) FILTER (WHERE df.status = 'PROMOTED') AS promoted_findings,
    COUNT(DISTINCT df.id) FILTER (WHERE df.status = 'REFUTED') AS refuted_findings,
    MAX(de.created_at) AS last_event_at,
    MAX(df.updated_at) AS last_finding_at
FROM daemon_territories t
LEFT JOIN daemon_events de ON de.territory_id = t.id
LEFT JOIN daemon_findings df ON df.territory_id = t.id
GROUP BY t.id;
`);

  // Vue d'évolution des phénotypes NCE
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_phenotype_evolution AS
SELECT
    agent_id,
    genome_id,
    strength,
    updated_at,
    LAG(strength) OVER (
        PARTITION BY agent_id, genome_id ORDER BY updated_at
    ) AS prev_strength,
    strength - LAG(strength) OVER (
        PARTITION BY agent_id, genome_id ORDER BY updated_at
    ) AS strength_delta
FROM agent_phenotype_states
ORDER BY agent_id, genome_id, updated_at;
`);

  // Vue d'efficacité des recettes cognitives
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_cognitive_recipe_effectiveness AS
SELECT
    recipe_id AS recipe_name,
    context AS context_key,
    runs AS total_uses,
    CASE WHEN runs > 0 THEN ROUND(100.0 * observed_gain / runs, 1) ELSE 0 END AS success_rate,
    observed_gain AS avg_improvement,
    updated_at AS last_used_at,
    RANK() OVER (PARTITION BY context ORDER BY observed_gain DESC) AS rank_in_context
FROM cognitive_recipe_performance;
`);
}

async function createSearchStatusView(db) {
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_search_pipeline_status AS
SELECT
    'fts5' AS search_mode,
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name LIKE '%fts%') AS index_count,
    (SELECT COUNT(*) FROM trajectories_fts) AS indexed_documents,
    'lexical' AS capability
UNION ALL
SELECT
    'vector',
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name LIKE '%vec%'),
    (SELECT COUNT(*) FROM rag_chunks),
    'semantic';
`);
}

async function createCapabilityRegistry(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS storage_capabilities (
    capability TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
    priority INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    last_verified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR REPLACE INTO storage_capabilities (capability, provider, available, priority, description)
VALUES
    ('operational', 'sqlite', 1, 0, 'OLTP source of truth'),
    ('graph', 'ladybug', 1, 10, 'Graph traversal and lineage'),
    ('analytics', 'duckdb', 1, 20, 'OLAP and benchmarks'),
    ('search_lexical', 'fts5', 1, 30, 'Full-text search'),
    ('search_semantic', 'sqlite-vec', 1, 31, 'Vector similarity search'),
    ('search_hybrid', 'hybrid', 1, 32, 'Combined FTS + vector + graph'),
    ('objects', 'filesystem', 1, 40, 'CAS for snapshots and artefacts')
;
`);
}

async function createQueryPlannerViews(db) {
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_storage_query_routes AS
SELECT
    capability,
    provider,
    available,
    priority,
    CASE
        WHEN capability = 'operational' THEN 'SELECT ... FROM <table> WHERE ...'
        WHEN capability = 'graph' THEN 'MATCH (n)-[r]->(m) WHERE ... RETURN ...'
        WHEN capability = 'analytics' THEN 'SELECT ... FROM <table> GROUP BY ...'
        WHEN capability LIKE 'search%' THEN 'SELECT ... FROM <table> WHERE ... ORDER BY score DESC'
        WHEN capability = 'objects' THEN 'SELECT hash, path FROM object_manifest WHERE ...'
    END AS query_pattern
FROM storage_capabilities
WHERE available = 1
ORDER BY priority;
`);
}

module.exports = {
  createAnalyticsViews,
  createSearchStatusView,
  createCapabilityRegistry,
  createQueryPlannerViews,
  async run(db) {
    await createAnalyticsViews(db);
    await createSearchStatusView(db);
    await createCapabilityRegistry(db);
    await createQueryPlannerViews(db);
  },
};
