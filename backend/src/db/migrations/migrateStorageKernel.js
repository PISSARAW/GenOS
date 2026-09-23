'use strict';

async function createProjectionOutbox(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS projection_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    organization_id TEXT,
    project_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    graph_projected_at TEXT,
    analytics_projected_at TEXT,
    search_projected_at TEXT
);

CREATE TABLE IF NOT EXISTS projection_consumers (
    consumer TEXT NOT NULL,
    projection_type TEXT NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (consumer, projection_type)
);

CREATE TABLE IF NOT EXISTS projection_failures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sequence INTEGER NOT NULL,
    consumer TEXT NOT NULL,
    error TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS projection_rebuilds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projection_type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    events_count INTEGER,
    status TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS projection_state (
    projection_type TEXT PRIMARY KEY,
    last_sequence INTEGER NOT NULL DEFAULT 0,
    last_event_id TEXT,
    projection_version INTEGER NOT NULL DEFAULT 0,
    checksum TEXT,
    built_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projection_events_created ON projection_events(created_at);
CREATE INDEX IF NOT EXISTS idx_projection_events_aggregate ON projection_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_projection_events_unprojected ON projection_events(graph_projected_at)
    WHERE graph_projected_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projection_failures_unresolved ON projection_failures(resolved_at)
    WHERE resolved_at IS NULL;
`);
}

async function createCollectiveStateTables(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS collective_members (
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (agent_id)
);

CREATE TABLE IF NOT EXISTS collective_capabilities (
    agent_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (agent_id, capability)
);

CREATE TABLE IF NOT EXISTS collective_resources (
    resource_type TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    allocated_to TEXT,
    amount REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (resource_type, resource_key)
);

CREATE TABLE IF NOT EXISTS collective_evidence (
    claim_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    source_table TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (claim_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS collective_snapshots (
    version INTEGER PRIMARY KEY AUTOINCREMENT,
    state_json TEXT NOT NULL,
    content_hash TEXT,
    parent_version INTEGER,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_collective_members_agent ON collective_members(agent_id);
CREATE INDEX IF NOT EXISTS idx_collective_capabilities_agent ON collective_capabilities(agent_id);
CREATE INDEX IF NOT EXISTS idx_collective_evidence_claim ON collective_evidence(claim_id);
`);
}

async function createWorldGraphTables(db) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS world_graph_nodes (
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    source_table TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    properties_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (node_id, node_type)
);

CREATE TABLE IF NOT EXISTS world_graph_edges (
    edge_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    properties_json TEXT NOT NULL DEFAULT '{}',
    valid_from TEXT,
    valid_to TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (edge_id)
);

CREATE INDEX IF NOT EXISTS idx_wg_nodes_type ON world_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_wg_nodes_source ON world_graph_nodes(source_table, source_record_id);
CREATE INDEX IF NOT EXISTS idx_wg_edges_source ON world_graph_edges(source_node_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_wg_edges_target ON world_graph_edges(target_node_id, edge_type);
`);
}

module.exports = {
  createProjectionOutbox,
  createCollectiveStateTables,
  createWorldGraphTables,
  async run(db) {
    await createProjectionOutbox(db);
    await createCollectiveStateTables(db);
    await createWorldGraphTables(db);
  },
};
