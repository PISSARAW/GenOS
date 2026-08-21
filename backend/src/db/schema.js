/**
 * GenOS Database Schema Definition
 * 18 Normalized SQLite Tables + Performance Indexes
 */

const CREATE_TABLES_SQL = `
-- 1. Security & RBAC Access Keys
CREATE TABLE IF NOT EXISTS access_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer', 'commander', 'architect', 'node')),
    permissions TEXT NOT NULL DEFAULT '["read"]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    last_used_at DATETIME,
    is_active INTEGER DEFAULT 1
);

-- 2. User Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'viewer',
    username TEXT NOT NULL DEFAULT 'operator',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked INTEGER DEFAULT 0
);

-- 3. Workspaces & Universes
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    visibility TEXT DEFAULT 'Private',
    language TEXT DEFAULT 'TypeScript',
    description TEXT,
    tags TEXT DEFAULT '[]',
    is_archived INTEGER DEFAULT 0,
    anomalies_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Workspace Snapshots (Time Machine)
CREATE TABLE IF NOT EXISTS workspace_snapshots (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    label TEXT NOT NULL,
    author TEXT NOT NULL,
    reason TEXT,
    diff_summary TEXT,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- 5. Agents & Swarm Workers
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'error', 'terminated', 'apoptosis', 'Active', 'Apoptosis')),
    agent_type TEXT NOT NULL DEFAULT 'Antigravity',
    workspace_id TEXT,
    model_tier TEXT DEFAULT 'Flash',
    isolation_mode TEXT DEFAULT 'Branch',
    parent_agent_id TEXT,
    current_task TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- 6. Trajectories & Code Proposals
CREATE TABLE IF NOT EXISTS trajectories (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    author_id TEXT,
    author_name TEXT NOT NULL DEFAULT 'GenOS Architect',
    reviewer_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'approved', 'rejected', 'revising')),
    semantic_summary TEXT,
    qa_feedback TEXT,
    diff_file TEXT,
    diff_stats TEXT,
    diff_lines TEXT DEFAULT '[]',
    confidence INTEGER DEFAULT 90,
    adversarial_result TEXT DEFAULT 'Passed (0 CVEs)',
    future_ci_result TEXT DEFAULT 'Clean',
    is_exceptional INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- 7. Lineage Nodes (MCTS / DAG)
CREATE TABLE IF NOT EXISTS lineage_nodes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    agent_id TEXT,
    snapshot_id TEXT,
    label TEXT NOT NULL,
    node_type TEXT NOT NULL CHECK (node_type IN ('core', 'agent', 'skill', 'checkpoint', 'fork', 'merge')),
    score REAL DEFAULT 0.0,
    visits INTEGER DEFAULT 0,
    state_summary TEXT,
    pos_x REAL DEFAULT 0,
    pos_y REAL DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Lineage Edges (DAG Connections)
CREATE TABLE IF NOT EXISTS lineage_edges (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    edge_type TEXT DEFAULT 'transition',
    is_animated INTEGER DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_node_id) REFERENCES lineage_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES lineage_nodes(id) ON DELETE CASCADE
);

-- 9. Experiments (Scientific, Incident, Co-evolution)
CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    title TEXT NOT NULL,
    experiment_type TEXT NOT NULL CHECK (experiment_type IN ('scientific_experiment', 'incident_experiment', 'security_coevolution', 'chaos_simulation')),
    status TEXT NOT NULL CHECK (status IN ('Setup', 'Running', 'Analyzed', 'Success', 'Failed')),
    chaos_level INTEGER DEFAULT 50,
    protocol_config TEXT DEFAULT '{}',
    results_summary TEXT,
    mind_map_nodes TEXT DEFAULT '[]',
    color TEXT DEFAULT '#0969da',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Experiment Waves (Live Monitoring Time-Series)
CREATE TABLE IF NOT EXISTS experiment_waves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    time_step INTEGER NOT NULL,
    success_rate REAL NOT NULL,
    stress_level REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

-- 11. Experiment Thoughts (Thought Stream)
CREATE TABLE IF NOT EXISTS experiment_thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experiment_id TEXT NOT NULL,
    agent_id TEXT,
    text TEXT NOT NULL,
    is_highlight INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

-- 12. Co-evolution Arenas (Red vs Blue Security Matrix)
CREATE TABLE IF NOT EXISTS coevolution_arenas (
    id TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    red_team_payloads TEXT DEFAULT '[]',
    blue_team_patches TEXT DEFAULT '[]',
    vuln_count INTEGER DEFAULT 0,
    patch_count INTEGER DEFAULT 0,
    arena_code TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

-- 13. Swarm Proposals (Consensus & Quorum)
CREATE TABLE IF NOT EXISTS swarm_proposals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    proposer_agent_id TEXT NOT NULL,
    proposer_name TEXT DEFAULT 'Swarm Leader',
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('open', 'passed', 'rejected', 'expired')),
    quorum_threshold REAL DEFAULT 0.66,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Swarm Votes
CREATE TABLE IF NOT EXISTS swarm_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_name TEXT DEFAULT 'Swarm Node',
    vote TEXT NOT NULL CHECK (vote IN ('yes', 'no', 'abstain')),
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES swarm_proposals(id) ON DELETE CASCADE,
    UNIQUE(proposal_id, agent_id)
);

-- 15. MCP Tools & Circuit Breaker Quarantine
CREATE TABLE IF NOT EXISTS mcp_tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    category TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('Low', 'Amber', 'High')),
    description TEXT,
    actions_json TEXT DEFAULT '[]',
    is_locked INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    circuit_state TEXT DEFAULT 'CLOSED' CHECK (circuit_state IN ('CLOSED', 'OPEN', 'HALF-OPEN')),
    quarantine_reason TEXT,
    equipped_agents TEXT DEFAULT '["Global Fleet"]',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. Telemetry Events (Observer Stream & Historical Audit)
CREATE TABLE IF NOT EXISTS telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    agent_id TEXT,
    event_type TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    payload_json TEXT DEFAULT '{}',
    severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 17. Genome Decisions (Learned Knowledge & Context Ingestion)
CREATE TABLE IF NOT EXISTS genome_decisions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    cart_nodes_json TEXT DEFAULT '[]',
    created_by TEXT NOT NULL,
    category TEXT DEFAULT 'Architecture',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 18. Trace Spans (Waterfall Observability)
CREATE TABLE IF NOT EXISTS trace_spans (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    parent_span_id TEXT,
    name TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    inputs_json TEXT DEFAULT '{}',
    outputs_json TEXT DEFAULT '{}',
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 19. Global Alerts (Incident Backlog)
CREATE TABLE IF NOT EXISTS global_alerts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('blocked', 'question', 'running', 'resolved')),
    agent_name TEXT NOT NULL,
    workspace_name TEXT NOT NULL,
    severity TEXT DEFAULT 'medium',
    confidence TEXT DEFAULT '95%',
    context_snapshot TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Compatibility / Dashboard stats
CREATE TABLE IF NOT EXISTS heatmap_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day INTEGER,
    actions INTEGER
);
CREATE TABLE IF NOT EXISTS system_stats (
    id INTEGER PRIMARY KEY,
    total_actions INTEGER,
    total_snapshots INTEGER,
    total_tasks INTEGER,
    total_swarms INTEGER
);
`;

const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry_events(created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_agent ON telemetry_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_trace_spans_agent ON trace_spans(agent_id);
CREATE INDEX IF NOT EXISTS idx_trajectories_status ON trajectories(status);
CREATE INDEX IF NOT EXISTS idx_lineage_workspace ON lineage_nodes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_access_keys_hash ON access_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
CREATE INDEX IF NOT EXISTS idx_snapshots_workspace ON workspace_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_votes_proposal ON swarm_votes(proposal_id);
`;

async function migrateLegacySchema(db) {
  try {
    const tableInfo = await db.all("PRAGMA table_info(agents)");
    if (tableInfo && tableInfo.length > 0) {
      const colNames = tableInfo.map(c => c.name);
      if (!colNames.includes('agent_type')) {
        // Legacy agents table without agent_type, drop and let CREATE_TABLES_SQL rebuild it
        await db.exec('DROP TABLE IF EXISTS agents;');
      }
    }
  } catch (err) {
    // Ignore migration error
  }
}

async function initializeSchema(db) {
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA busy_timeout = 5000;');
  await db.exec('PRAGMA synchronous = NORMAL;');
  await db.exec('PRAGMA foreign_keys = ON;');
  await migrateLegacySchema(db);
  await db.exec(CREATE_TABLES_SQL);
  await db.exec(CREATE_INDEXES_SQL);
}

module.exports = {
  initializeSchema,
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL
};
