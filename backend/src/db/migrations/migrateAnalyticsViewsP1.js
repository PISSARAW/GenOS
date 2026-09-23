'use strict';

async function createDaemonInteroceptionView(db) {
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_daemon_interoception_log AS
SELECT
    territory_id,
    'event' AS source,
    event_type,
    COALESCE(priority, 'info') AS severity,
    NULL AS status,
    COALESCE(payload_json, '') AS detail,
    created_at
FROM daemon_events
UNION ALL
SELECT
    territory_id,
    'finding' AS source,
    'finding:' || COALESCE(hypothesis_id, 'unknown') AS event_type,
    CASE
        WHEN status = 'PROMOTED' THEN 'info'
        WHEN status = 'REFUTED' THEN 'warning'
        WHEN status = 'EXPIRED' THEN 'warning'
        ELSE 'info'
    END AS severity,
    status,
    COALESCE(head_sha, '') AS detail,
    updated_at AS created_at
FROM daemon_findings
ORDER BY created_at DESC;
`);
}

async function createLineageTraversalView(db) {
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_lineage_ancestors AS
WITH RECURSIVE ancestors(id, ancestor_id, depth) AS (
    SELECT source_node_id, target_node_id, 1
    FROM lineage_edges
    WHERE source_node_id IS NOT NULL AND target_node_id IS NOT NULL
    UNION ALL
    SELECT a.id, le.target_node_id, a.depth + 1
    FROM ancestors a
    JOIN lineage_edges le ON le.source_node_id = a.ancestor_id
    WHERE a.depth < 25
)
SELECT * FROM ancestors;
`);
}

async function createFamilyTreeView(db) {
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_agent_family_tree AS
SELECT
    ar.id,
    ar.source_agent_id AS parent_id,
    ar.target_agent_id AS child_id,
    ar.relation_type AS relation_class,
    COALESCE(ar.organization_id, '') AS scope,
    a1.name AS parent_name,
    a2.name AS child_name,
    ar.updated_at AS created_at
FROM agent_relations ar
LEFT JOIN agents a1 ON a1.id = ar.source_agent_id
LEFT JOIN agents a2 ON a2.id = ar.target_agent_id;
`);
}

async function createCommunicationScopeView(db) {
  await db.exec(`
CREATE VIEW IF NOT EXISTS v_communication_scope_efficiency AS
SELECT
    COALESCE(w.organization_id, '') AS organization_id,
    COALESCE(w.project_id, '') AS project_id,
    co.sender_id,
    co.receiver_id,
    COUNT(*) AS total_outcomes,
    SUM(CASE WHEN co.outcome = 'success' THEN 1 ELSE 0 END) AS successes,
    SUM(CASE WHEN co.outcome = 'failed' THEN 1 ELSE 0 END) AS failures,
    SUM(CASE WHEN co.outcome = 'timeout' THEN 1 ELSE 0 END) AS timeouts,
    ROUND(100.0 * SUM(CASE WHEN co.outcome = 'success' THEN 1 ELSE 0 END) / COUNT(*), 1) AS success_rate,
    MAX(co.created_at) AS last_communication_at
FROM communication_outcomes co
LEFT JOIN agents a ON a.id = co.sender_id
LEFT JOIN workspaces w ON w.id = a.workspace_id
GROUP BY
    COALESCE(w.organization_id, ''),
    COALESCE(w.project_id, ''),
    co.sender_id,
    co.receiver_id;
`);
}

module.exports = {
  createDaemonInteroceptionView,
  createLineageTraversalView,
  createFamilyTreeView,
  createCommunicationScopeView,
  async run(db) {
    await createDaemonInteroceptionView(db);
    await createLineageTraversalView(db);
    await createFamilyTreeView(db);
    await createCommunicationScopeView(db);
  },
};
