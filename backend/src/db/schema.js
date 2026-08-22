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
    ,organization_id TEXT
    ,project_id TEXT
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
    agent_type TEXT NOT NULL DEFAULT 'GenOS',
    execution_mode TEXT NOT NULL DEFAULT 'orchestrator' CHECK (execution_mode IN ('orchestrator', 'worker')),
    workspace_id TEXT,
    fleet_id TEXT,
    hallucination_monitoring INTEGER NOT NULL DEFAULT 0,
    hallucination_count INTEGER NOT NULL DEFAULT 0,
    model_tier TEXT DEFAULT 'Flash',
    language TEXT DEFAULT 'TypeScript',
    isolation_mode TEXT DEFAULT 'Branch',
    parent_agent_id TEXT,
    lineage_relation TEXT DEFAULT 'independent',
    about TEXT,
    current_task TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS resilience_policies (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    max_consecutive_failures INTEGER NOT NULL DEFAULT 3,
    max_cost_usd REAL NOT NULL DEFAULT 1.0,
    divergence_threshold REAL NOT NULL DEFAULT 0.55,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trinity_worlds (
    id TEXT PRIMARY KEY,
    mission TEXT NOT NULL,
    world_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    strategy TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    agent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

-- 20. Platform & Safety control plane (Zero Trust, approvals and providers)
CREATE TABLE IF NOT EXISTS agent_permissions (
    agent_id TEXT PRIMARY KEY,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    denied_tools_json TEXT NOT NULL DEFAULT '[]',
    taint_policy TEXT NOT NULL DEFAULT 'block_external'
);
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    agent_id TEXT,
    action TEXT NOT NULL,
    resource TEXT,
    decision TEXT NOT NULL,
    reason TEXT,
    payload_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_approvals (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    agent_id TEXT,
    risk TEXT NOT NULL,
    uncertainty REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by TEXT NOT NULL,
    decision_by TEXT,
    reason TEXT,
    payload_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME
);
CREATE TABLE IF NOT EXISTS provider_configs (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    endpoint TEXT,
    capabilities_json TEXT DEFAULT '[]',
    cost_input REAL DEFAULT 0,
    cost_output REAL DEFAULT 0,
    latency_ms REAL DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    UNIQUE(provider, model)
);

CREATE TABLE IF NOT EXISTS agent_model_routing_policies (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    policy_json TEXT NOT NULL DEFAULT '{}',
    organization_id TEXT,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, organization_id, project_id)
);

-- 21. Versioned strategy contracts selected by orchestrator agents
CREATE TABLE IF NOT EXISTS strategy_contracts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    workspace_id TEXT,
    version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('proposed', 'active', 'superseded', 'completed', 'rejected')),
    primary_strategy TEXT NOT NULL,
    contract_hash TEXT NOT NULL,
    contract_json TEXT NOT NULL,
    decision_reason TEXT,
    created_by TEXT NOT NULL DEFAULT 'orchestrator',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
    UNIQUE(agent_id, version)
);

-- 22. Runtime execution of an immutable strategy contract
CREATE TABLE IF NOT EXISTS strategy_execution_runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    contract_version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'running', 'awaiting_approval', 'completed', 'failed', 'blocked', 'cancelled')),
    budget_json TEXT NOT NULL DEFAULT '{}',
    metrics_json TEXT NOT NULL DEFAULT '{}',
    guardrail_reason TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id) REFERENCES strategy_contracts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS strategy_execution_steps (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    stage_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'running', 'awaiting_approval', 'completed', 'failed', 'skipped', 'blocked')),
    strategy_ids_json TEXT NOT NULL DEFAULT '[]',
    planned_budget_json TEXT NOT NULL DEFAULT '{}',
    actual_metrics_json TEXT NOT NULL DEFAULT '{}',
    evidence_json TEXT NOT NULL DEFAULT '[]',
    started_at DATETIME,
    completed_at DATETIME,
    UNIQUE(run_id, sequence),
    FOREIGN KEY (run_id) REFERENCES strategy_execution_runs(id) ON DELETE CASCADE
);

-- 23. Versioned Studio migrations (safe, idempotent upgrades)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 24. Compliance report history and export metadata
CREATE TABLE IF NOT EXISTS compliance_reports (
    id TEXT PRIMARY KEY,
    framework TEXT NOT NULL CHECK (framework IN ('EU_AI_ACT', 'SOC_2', 'HIPAA')),
    workspace_id TEXT,
    status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'archived')),
    score REAL NOT NULL,
    findings_json TEXT NOT NULL DEFAULT '[]',
    evidence_json TEXT NOT NULL DEFAULT '[]',
    generated_by TEXT NOT NULL DEFAULT 'studio',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

-- 25. IDE installations use the same signed command contract
CREATE TABLE IF NOT EXISTS ide_integrations (
    id TEXT PRIMARY KEY,
    ide TEXT NOT NULL CHECK (ide IN ('vscode', 'jetbrains', 'antigravity')),
    workspace_id TEXT,
    version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'revoked')),
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS evaluation_runs (
    id TEXT PRIMARY KEY,
    benchmark TEXT NOT NULL,
    model_version TEXT,
    prompt_hash TEXT,
    genome_hash TEXT,
    config_hash TEXT,
    score REAL,
    brier_score REAL,
    abstained INTEGER DEFAULT 0,
    result_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provenance_records (
    id TEXT PRIMARY KEY,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    parent_hash TEXT,
    algorithm TEXT NOT NULL DEFAULT 'sha256',
    payload_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    event_type TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    channels_json TEXT NOT NULL DEFAULT '["studio"]',
    threshold REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 26. Versioned visual workflows and their execution requests
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'staging', 'published', 'archived')),
    graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    workflow_version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    input_json TEXT NOT NULL DEFAULT '{}',
    output_json TEXT,
    error_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- 27. Prompt registry and immutable prompt versions
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    current_version INTEGER NOT NULL DEFAULT 1,
    variables_json TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prompt_versions (
    id TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    template TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
    UNIQUE(prompt_id, version)
);

-- 28. Workspace evaluation datasets and batch jobs
CREATE TABLE IF NOT EXISTS datasets (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS dataset_cases (id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, input_json TEXT NOT NULL DEFAULT '{}', expected_json TEXT, labels_json TEXT NOT NULL DEFAULT '[]', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS evaluation_jobs (id TEXT PRIMARY KEY, dataset_id TEXT, status TEXT NOT NULL DEFAULT 'queued', config_json TEXT NOT NULL DEFAULT '{}', result_json TEXT, error_json TEXT, attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME, FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE SET NULL);

-- 29. RAG document, chunk and retrieval records
CREATE TABLE IF NOT EXISTS rag_documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, content_length INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rag_chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, content TEXT NOT NULL, embedding_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(document_id) REFERENCES rag_documents(id) ON DELETE CASCADE);

-- 30. Installed connectors, plugins and their tested schemas
CREATE TABLE IF NOT EXISTS integrations (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'connector', status TEXT NOT NULL DEFAULT 'installed', config_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);

-- 31. Controlled workflow releases and rollback state
CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, version INTEGER NOT NULL, environment TEXT NOT NULL DEFAULT 'staging', traffic REAL NOT NULL DEFAULT 100, status TEXT NOT NULL DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(workflow_id) REFERENCES workflows(id) ON DELETE CASCADE);

-- 31b. Progressive delivery, SLOs and attributable project usage
CREATE TABLE IF NOT EXISTS release_rollouts (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    strategy TEXT NOT NULL CHECK (strategy IN ('canary', 'ab')),
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'promoted', 'rolled_back', 'paused')),
    config_json TEXT NOT NULL DEFAULT '{}',
    decision_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS release_rollout_metrics (
    rollout_id TEXT NOT NULL,
    variant TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    latency_ms_total REAL NOT NULL DEFAULT 0,
    tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(rollout_id, variant),
    FOREIGN KEY(rollout_id) REFERENCES release_rollouts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS release_slo_policies (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    max_error_rate REAL NOT NULL DEFAULT 0.01,
    max_p95_latency_ms REAL NOT NULL DEFAULT 3000,
    min_requests INTEGER NOT NULL DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, project_id, name)
);
CREATE TABLE IF NOT EXISTS usage_ledger (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    release_id TEXT,
    category TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE SET NULL
);

-- 31c. Immutable artifact registries and shareable marketplace listings
CREATE TABLE IF NOT EXISTS registry_artifacts (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('model', 'prompt', 'tool', 'workflow')),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, project_id, kind, name)
);
CREATE TABLE IF NOT EXISTS registry_artifact_versions (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    manifest_json TEXT NOT NULL,
    digest TEXT NOT NULL,
    labels_json TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(artifact_id) REFERENCES registry_artifacts(id) ON DELETE CASCADE,
    UNIQUE(artifact_id, version)
);
CREATE TABLE IF NOT EXISTS marketplace_listings (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL UNIQUE,
    publisher_organization_id TEXT NOT NULL,
    publisher_project_id TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'withdrawn')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(artifact_id) REFERENCES registry_artifacts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS marketplace_installs (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    artifact_id TEXT NOT NULL,
    installed_version INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_id, project_id),
    FOREIGN KEY(listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    FOREIGN KEY(artifact_id) REFERENCES registry_artifacts(id) ON DELETE CASCADE
);

-- 31d. Executable external framework runs, scoped to the calling project
CREATE TABLE IF NOT EXISTS framework_executions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    framework TEXT NOT NULL,
    trace_id TEXT NOT NULL,
    status TEXT NOT NULL,
    input_json TEXT NOT NULL DEFAULT '{}',
    output_json TEXT,
    error_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- 33. Provider playground jobs with retry and timeout policy
CREATE TABLE IF NOT EXISTS model_jobs (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, models_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'queued', config_json TEXT NOT NULL DEFAULT '{}', attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, timeout_ms INTEGER NOT NULL DEFAULT 30000, result_json TEXT, error_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME);
CREATE TABLE IF NOT EXISTS model_job_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, model TEXT NOT NULL, token_index INTEGER NOT NULL, token TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(job_id) REFERENCES model_jobs(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS webhook_subscriptions (id TEXT PRIMARY KEY, url TEXT NOT NULL, events TEXT NOT NULL DEFAULT '["*"]', secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

-- 32. Organization, project and environment tenancy
CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS environments (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, organization_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(organization_id, name), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS organization_memberships (principal_id TEXT NOT NULL, organization_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(principal_id, organization_id), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS project_memberships (principal_id TEXT NOT NULL, project_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(principal_id, project_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE);
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
CREATE INDEX IF NOT EXISTS idx_trinity_worlds_agent ON trinity_worlds(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON platform_approvals(status);
CREATE INDEX IF NOT EXISTS idx_compliance_framework ON compliance_reports(framework, created_at);
CREATE INDEX IF NOT EXISTS idx_ide_workspace ON ide_integrations(workspace_id, ide);
CREATE INDEX IF NOT EXISTS idx_provenance_subject ON provenance_records(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_benchmark ON evaluation_runs(benchmark, created_at);
CREATE INDEX IF NOT EXISTS idx_strategy_contract_agent ON strategy_contracts(agent_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_execution_agent ON strategy_execution_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_execution_steps ON strategy_execution_steps(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions(prompt_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_cases_dataset ON dataset_cases(dataset_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_releases_environment ON releases(environment, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_rollouts_scope ON release_rollouts(organization_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_scope ON usage_ledger(organization_id, project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_registry_artifacts_scope ON registry_artifacts(organization_id, project_id, kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_framework_executions_scope ON framework_executions(organization_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_environments_org ON environments(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_model_job_tokens ON model_job_tokens(job_id, id);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_org_memberships_principal ON organization_memberships(principal_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_project_memberships_principal ON project_memberships(principal_id, project_id);
`;

async function migrateLegacySchema(db) {
  try {
    const tableInfo = await db.all("PRAGMA table_info(agents)");
    if (tableInfo && tableInfo.length > 0) {
      const colNames = tableInfo.map(c => c.name);
      if (!colNames.includes('agent_type')) {
        // Legacy agents table without agent_type, drop and let CREATE_TABLES_SQL rebuild it
        await db.exec('DROP TABLE IF EXISTS agents;');
      } else {
        if (!colNames.includes('fleet_id')) await db.exec('ALTER TABLE agents ADD COLUMN fleet_id TEXT;');
        if (!colNames.includes('hallucination_monitoring')) await db.exec('ALTER TABLE agents ADD COLUMN hallucination_monitoring INTEGER NOT NULL DEFAULT 0;');
        if (!colNames.includes('hallucination_count')) await db.exec('ALTER TABLE agents ADD COLUMN hallucination_count INTEGER NOT NULL DEFAULT 0;');
        if (!colNames.includes('execution_mode')) await db.exec("ALTER TABLE agents ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'orchestrator';");
      }
      if (!colNames.includes('lineage_relation')) {
        await db.exec("ALTER TABLE agents ADD COLUMN lineage_relation TEXT DEFAULT 'independent';");
      }
      if (!colNames.includes('about')) {
        await db.exec('ALTER TABLE agents ADD COLUMN about TEXT;');
      }
      if (!colNames.includes('language')) {
        await db.exec("ALTER TABLE agents ADD COLUMN language TEXT DEFAULT 'TypeScript';");
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
  await applyVersionedMigrations(db);
  await db.run('INSERT OR IGNORE INTO resilience_policies (id) VALUES (1)');
  for (const eventType of ['error', 'cognitive_drift', 'budget', 'blocked', 'human_escalation']) {
    await db.run('INSERT OR IGNORE INTO notification_preferences (event_type) VALUES (?)', eventType);
  }
  await db.exec(CREATE_INDEXES_SQL);
}

async function applyVersionedMigrations(db) {
  const migrations = [
    ['001-compliance-ide', 'Add compliance reports and IDE integration contracts'],
    ['002-strategy-contracts', 'Add versioned orchestrator strategy contracts'],
    ['003-tenant-scopes', 'Add organization, project and membership isolation'],
    ['004-evaluation-job-retries', 'Persist evaluation job retries and terminal errors'],
    ['005-agent-authority', 'Require an orchestrator to dispatch worker agents']
  ];
  const workspaceColumns = await db.all('PRAGMA table_info(workspaces)');
  const names = new Set(workspaceColumns.map(column => column.name));
  if (!names.has('organization_id')) await db.exec('ALTER TABLE workspaces ADD COLUMN organization_id TEXT');
  if (!names.has('project_id')) await db.exec('ALTER TABLE workspaces ADD COLUMN project_id TEXT');
  const organization = await db.get('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
  if (organization) {
    await db.run('INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES (?, ?, ?)', `project-${organization.id}`, organization.id, 'default');
    await db.run('UPDATE workspaces SET organization_id = COALESCE(organization_id, ?), project_id = COALESCE(project_id, ?) WHERE organization_id IS NULL OR project_id IS NULL', organization.id, `project-${organization.id}`);
  }
  for (const table of ['prompts', 'datasets', 'rag_documents', 'integrations', 'workflows', 'releases', 'model_jobs', 'evaluation_jobs']) {
    const columns = await db.all(`PRAGMA table_info(${table})`);
    const columnNames = new Set(columns.map(column => column.name));
    if (!columnNames.has('organization_id')) await db.exec(`ALTER TABLE ${table} ADD COLUMN organization_id TEXT`);
    if (!columnNames.has('project_id')) await db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT`);
  }
  const evaluationColumns = await db.all('PRAGMA table_info(evaluation_jobs)');
  const evaluationNames = new Set(evaluationColumns.map(column => column.name));
  if (!evaluationNames.has('error_json')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN error_json TEXT');
  if (!evaluationNames.has('attempts')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
  if (!evaluationNames.has('max_attempts')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3');
  for (const [version, description] of migrations) {
    await db.run('INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)', version, description);
  }
}

module.exports = {
  initializeSchema,
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL
};
