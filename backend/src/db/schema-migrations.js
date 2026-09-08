//! Legacy migrations and versioned schema upgrades.

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
      if (!colNames.includes('name_meaning')) {
        await db.exec('ALTER TABLE agents ADD COLUMN name_meaning TEXT;');
      }
      if (!colNames.includes('dissonance_level')) {
        await db.exec('ALTER TABLE agents ADD COLUMN dissonance_level REAL DEFAULT 0.0;');
      }
      if (!colNames.includes('eureka_count')) {
        await db.exec('ALTER TABLE agents ADD COLUMN eureka_count INTEGER DEFAULT 0;');
      }
      if (!colNames.includes('cognitive_budget')) {
        await db.exec('ALTER TABLE agents ADD COLUMN cognitive_budget REAL DEFAULT 100.0;');
      }
      if (!colNames.includes('cognitive_baseline_budget')) {
        await db.exec('ALTER TABLE agents ADD COLUMN cognitive_baseline_budget REAL DEFAULT 100.0;');
      }
      if (!colNames.includes('cognitive_max_dissonance')) {
        await db.exec('ALTER TABLE agents ADD COLUMN cognitive_max_dissonance REAL DEFAULT 50.0;');
      }
      if (!colNames.includes('conscience_revision')) {
        await db.exec('ALTER TABLE agents ADD COLUMN conscience_revision INTEGER NOT NULL DEFAULT 0;');
      }
      if (!colNames.includes('is_apoptotic')) {
        await db.exec('ALTER TABLE agents ADD COLUMN is_apoptotic INTEGER DEFAULT 0;');
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
    ['002-strategy-contracts', 'Add versioned orchestrator strategy contracts'],
    ['003-tenant-scopes', 'Add organization, project and membership isolation'],
    ['004-evaluation-job-retries', 'Persist evaluation job retries and terminal errors'],
    ['005-agent-authority', 'Require an orchestrator to dispatch worker agents'],
    ['006-agent-blocked-status', 'Allow guarded agent missions to persist a blocked status'],
    ['007-durable-cryptobiosis', 'Persist cryptobiosis state across backend restarts'],
    ['008-tenant-workspace-names', 'Scope workspace name uniqueness to organization and project'],
    ['009-agent-completed-status', 'Distinguish successful completion from idle availability and blocked termination'],
    ['010-temporal-synapses', 'Persist neurotransmitter and spike timing for synaptic plasticity'],
    ['011-project-lifecycle', 'Persist active and archived project lifecycle state'],
    ['012-agent-runtime-pid', 'Persist runtime process ownership across cluster workers'],
    ['013-durable-cryptobiosis', 'Persist durable cryptobiosis capsule references'],
    ['014-episodic-memories', 'Add dedicated episodic memories persistence and indexing'],
    ['015-synapse-indexes', 'Add B-Tree indexes on memory_synapses for target, weight, pruning and tenant scoping'],
    ['016-workflow-version-snapshots', 'Persist immutable workflow definitions for queued and historical runs'],
    ['017-reversible-episodic-retention', 'Keep purged episodic memories as restorable tombstones']
  ];
  await db.exec(`CREATE TABLE IF NOT EXISTS episodic_memories (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    task_id TEXT,
    turn_number INTEGER DEFAULT 0,
    action_type TEXT,
    context_state TEXT DEFAULT '{}',
    action_input TEXT,
    observation_output TEXT,
    reward_score REAL DEFAULT 0.0,
    is_consolidated INTEGER DEFAULT 0,
    is_purged INTEGER NOT NULL DEFAULT 0,
    purged_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_episodic_agent_session ON episodic_memories (agent_id, session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_episodic_consolidated ON episodic_memories (is_consolidated, created_at);
  CREATE INDEX IF NOT EXISTS idx_conscience_transitions_agent_rev ON conscience_transitions(agent_id, to_revision);
  CREATE INDEX IF NOT EXISTS idx_conscience_transitions_created ON conscience_transitions(created_at);`);
  const episodicColumns = new Set((await db.all('PRAGMA table_info(episodic_memories)')).map((column) => column.name));
  if (!episodicColumns.has('is_purged')) await db.exec('ALTER TABLE episodic_memories ADD COLUMN is_purged INTEGER NOT NULL DEFAULT 0');
  if (!episodicColumns.has('purged_at')) await db.exec('ALTER TABLE episodic_memories ADD COLUMN purged_at DATETIME');
  await migrateAgentStatusConstraint(db);
  await migrateLineageNodeTypeConstraint(db);
  const agentRuntimeColumns = new Set((await db.all('PRAGMA table_info(agents)')).map((column) => column.name));
  if (!agentRuntimeColumns.has('runtime_pid')) await db.exec('ALTER TABLE agents ADD COLUMN runtime_pid INTEGER');
  if (!agentRuntimeColumns.has('runtime_started_at')) await db.exec('ALTER TABLE agents ADD COLUMN runtime_started_at DATETIME');
  if (!agentRuntimeColumns.has('runtime_executable')) await db.exec('ALTER TABLE agents ADD COLUMN runtime_executable TEXT');
  const cryptobiosisColumns = new Set((await db.all('PRAGMA table_info(cryptobiosis_snapshots)')).map((column) => column.name));
  if (cryptobiosisColumns.size && !cryptobiosisColumns.has('snapshot_id')) {
    await db.exec('ALTER TABLE cryptobiosis_snapshots RENAME TO cryptobiosis_snapshots_legacy');
  }
  await db.exec(`CREATE TABLE IF NOT EXISTS cryptobiosis_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    workspace_id TEXT,
    capsule_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('freezing', 'frozen', 'thawing', 'thawed', 'failed')),
    metadata_json TEXT NOT NULL DEFAULT '{}',
    frozen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    thawed_at DATETIME,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
  )`);
  if (cryptobiosisColumns.size && !cryptobiosisColumns.has('snapshot_id')) {
    await db.exec(`INSERT OR IGNORE INTO cryptobiosis_snapshots
      (snapshot_id, agent_id, workspace_id, capsule_hash, status, metadata_json, frozen_at, thawed_at)
      SELECT id,
        COALESCE(json_extract(state_json, '$.agentId'), id),
        workspace_id,
        'legacy:' || id,
        CASE WHEN thawed_at IS NULL THEN 'frozen' ELSE 'thawed' END,
        json_object('legacy', 1, 'reason', reason, 'state_json', state_json),
        frozen_at,
        thawed_at
      FROM cryptobiosis_snapshots_legacy`);
    await db.exec('DROP TABLE cryptobiosis_snapshots_legacy');
  }
  const cryptoColsNow = new Set((await db.all('PRAGMA table_info(cryptobiosis_snapshots)')).map(column => column.name));
  if (!cryptoColsNow.has('id')) await db.exec('ALTER TABLE cryptobiosis_snapshots ADD COLUMN id TEXT');
  if (!cryptoColsNow.has('reason')) await db.exec('ALTER TABLE cryptobiosis_snapshots ADD COLUMN reason TEXT');
  if (!cryptoColsNow.has('state_json')) await db.exec('ALTER TABLE cryptobiosis_snapshots ADD COLUMN state_json TEXT');
  if (!cryptoColsNow.has('thawed_by')) await db.exec('ALTER TABLE cryptobiosis_snapshots ADD COLUMN thawed_by TEXT');
  const workspaceColumns = await db.all('PRAGMA table_info(workspaces)');
  const names = new Set(workspaceColumns.map(column => column.name));
  if (!names.has('organization_id')) await db.exec('ALTER TABLE workspaces ADD COLUMN organization_id TEXT');
  if (!names.has('project_id')) await db.exec('ALTER TABLE workspaces ADD COLUMN project_id TEXT');
  await migrateWorkspaceNameConstraint(db);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_versions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
      UNIQUE(workflow_id, version)
    );
    INSERT OR IGNORE INTO workflow_versions (id, workflow_id, version, graph_json, metadata_json, created_at)
      SELECT 'wfv-' || id, id, version, graph_json, metadata_json, COALESCE(updated_at, CURRENT_TIMESTAMP)
      FROM workflows;
    CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON workflow_versions(workflow_id, version DESC);
  `);
  const organizationCount = await db.get('SELECT COUNT(*) AS count FROM organizations');
  const organization = Number(organizationCount?.count) === 1
    ? await db.get('SELECT id FROM organizations LIMIT 1')
    : null;
  const projectColumns = await db.all('PRAGMA table_info(projects)');
  if (!projectColumns.some((column) => column.name === 'status')) await db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  if (organization) {
    await db.run('INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES (?, ?, ?)', `project-${organization.id}`, organization.id, 'default');
    await db.run('UPDATE OR IGNORE workspaces SET organization_id = COALESCE(organization_id, ?), project_id = COALESCE(project_id, ?) WHERE organization_id IS NULL OR project_id IS NULL', organization.id, `project-${organization.id}`);
  }
  for (const table of ['prompts', 'datasets', 'rag_documents', 'integrations', 'workflows', 'workflow_runs', 'experiments', 'global_alerts', 'webhook_subscriptions', 'secrets', 'platform_approvals', 'agent_permissions', 'releases', 'model_jobs', 'evaluation_jobs', 'evaluation_runs', 'provenance_records', 'notification_preferences', 'genome_decisions', 'memory_synapses', 'trace_spans', 'telemetry_events']) {
    const columns = await db.all(`PRAGMA table_info(${table})`);
    const columnNames = new Set(columns.map(column => column.name));
    if (!columnNames.has('organization_id')) await db.exec(`ALTER TABLE ${table} ADD COLUMN organization_id TEXT`);
    if (!columnNames.has('project_id')) await db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT`);
    if (table === 'trace_spans' && !columnNames.has('workspace_id')) await db.exec('ALTER TABLE trace_spans ADD COLUMN workspace_id TEXT');
    if (table === 'evaluation_runs' && !columnNames.has('agent_id')) await db.exec('ALTER TABLE evaluation_runs ADD COLUMN agent_id TEXT');
    if (table === 'telemetry_events' && !columnNames.has('event_id')) await db.exec('ALTER TABLE telemetry_events ADD COLUMN event_id TEXT');
    if (table === 'workflow_runs' && !columnNames.has('attempts')) await db.exec('ALTER TABLE workflow_runs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
    if (table === 'workflow_runs' && !columnNames.has('max_attempts')) await db.exec('ALTER TABLE workflow_runs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3');
    if (table === 'workflow_runs' && !columnNames.has('timeout_ms')) await db.exec('ALTER TABLE workflow_runs ADD COLUMN timeout_ms INTEGER NOT NULL DEFAULT 30000');
    if (table === 'workflow_runs' && !columnNames.has('claimed_at')) await db.exec('ALTER TABLE workflow_runs ADD COLUMN claimed_at DATETIME');
    if (table === 'workflow_runs' && !columnNames.has('next_attempt_at')) await db.exec('ALTER TABLE workflow_runs ADD COLUMN next_attempt_at DATETIME');
    if (table === 'model_jobs' && !columnNames.has('claimed_at')) await db.exec('ALTER TABLE model_jobs ADD COLUMN claimed_at DATETIME');
    if (table === 'model_jobs' && !columnNames.has('next_attempt_at')) await db.exec('ALTER TABLE model_jobs ADD COLUMN next_attempt_at DATETIME');
    if (table === 'evaluation_jobs' && !columnNames.has('claimed_at')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN claimed_at DATETIME');
    if (table === 'evaluation_jobs' && !columnNames.has('next_attempt_at')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN next_attempt_at DATETIME');
  }
  await db.run(`UPDATE global_alerts
    SET organization_id = (SELECT organization_id FROM workspaces WHERE workspaces.name = global_alerts.workspace_name GROUP BY workspaces.name HAVING COUNT(*) = 1),
        project_id = (SELECT project_id FROM workspaces WHERE workspaces.name = global_alerts.workspace_name GROUP BY workspaces.name HAVING COUNT(*) = 1)
    WHERE organization_id IS NULL OR project_id IS NULL`);
    for (const table of ['workflow_runs', 'evaluation_jobs', 'model_jobs']) {
      const columns = new Set((await db.all(`PRAGMA table_info(${table})`)).map((column) => column.name));
      if (!columns.has('priority')) await db.exec(`ALTER TABLE ${table} ADD COLUMN priority INTEGER NOT NULL DEFAULT 0`);
    }
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_event_id ON telemetry_events(event_id) WHERE event_id IS NOT NULL');
  await migrateDatasetNameConstraint(db);
  await migrateNotificationPreferenceScope(db);
  const evaluationColumns = await db.all('PRAGMA table_info(evaluation_jobs)');
  const evaluationNames = new Set(evaluationColumns.map(column => column.name));
  if (!evaluationNames.has('error_json')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN error_json TEXT');
  if (!evaluationNames.has('attempts')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
  if (!evaluationNames.has('max_attempts')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3');
  if (!evaluationNames.has('campaign_id')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN campaign_id TEXT');
  const synapseColumns = new Set((await db.all('PRAGMA table_info(memory_synapses)')).map(column => column.name));
  const synapseAlterations = [
    ['transmitter_type', "ALTER TABLE memory_synapses ADD COLUMN transmitter_type TEXT NOT NULL DEFAULT 'glutamate'"],
    ['pre_spike_at', 'ALTER TABLE memory_synapses ADD COLUMN pre_spike_at INTEGER'],
    ['post_spike_at', 'ALTER TABLE memory_synapses ADD COLUMN post_spike_at INTEGER'],
    ['delta_t_ms', 'ALTER TABLE memory_synapses ADD COLUMN delta_t_ms REAL'],
    ['receptor_density', 'ALTER TABLE memory_synapses ADD COLUMN receptor_density REAL NOT NULL DEFAULT 1.0'],
    ['activity_history', 'ALTER TABLE memory_synapses ADD COLUMN activity_history INTEGER NOT NULL DEFAULT 0'],
    ['c3_opsonization', 'ALTER TABLE memory_synapses ADD COLUMN c3_opsonization REAL NOT NULL DEFAULT 0.0'],
    ['cd47_expression', 'ALTER TABLE memory_synapses ADD COLUMN cd47_expression REAL NOT NULL DEFAULT 1.0'],
    ['spine_morphology', "ALTER TABLE memory_synapses ADD COLUMN spine_morphology TEXT NOT NULL DEFAULT 'thin'"],
    ['compartment_type', "ALTER TABLE memory_synapses ADD COLUMN compartment_type TEXT NOT NULL DEFAULT 'apical'"],
    ['electrotonic_dist', 'ALTER TABLE memory_synapses ADD COLUMN electrotonic_dist REAL NOT NULL DEFAULT 0.75'],
    ['nmda_receptors', 'ALTER TABLE memory_synapses ADD COLUMN nmda_receptors REAL NOT NULL DEFAULT 1.0'],
    ['last_updated_at', 'ALTER TABLE memory_synapses ADD COLUMN last_updated_at DATETIME']
  ].filter(([column]) => !synapseColumns.has(column));
  if (synapseAlterations.length) {
    await db.exec('BEGIN IMMEDIATE;');
    try {
      for (const [, sql] of synapseAlterations) await db.exec(sql);
      await db.exec('COMMIT;');
    } catch (error) {
      await db.exec('ROLLBACK;');
      throw error;
    }
  }
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_queue ON workflow_runs(status, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_evaluation_jobs_queue ON evaluation_jobs(status, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_model_jobs_queue ON model_jobs(status, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_synapses_target ON memory_synapses(target_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_weight ON memory_synapses(weight);
    CREATE INDEX IF NOT EXISTS idx_synapses_pruning ON memory_synapses(c3_opsonization, cd47_expression);
    CREATE INDEX IF NOT EXISTS idx_synapses_tenant ON memory_synapses(organization_id, project_id);
    CREATE INDEX IF NOT EXISTS idx_provenance_payload_hash ON provenance_records(payload_hash);
    CREATE INDEX IF NOT EXISTS idx_provenance_parent_hash ON provenance_records(parent_hash);
  `);
  for (const [version, description] of migrations) {
    await db.run('INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)', version, description);
  }
}

async function migrateDatasetNameConstraint(db) {
  const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'datasets'");
  if (!table?.sql || !/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(table.sql)) return;
  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.exec('BEGIN IMMEDIATE;');
    await db.exec(`CREATE TABLE datasets_tenant_scoped (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', metadata_json TEXT NOT NULL DEFAULT '{}',
      organization_id TEXT, project_id TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, project_id, name)
    );
    INSERT INTO datasets_tenant_scoped (id, name, description, metadata_json, organization_id, project_id, created_at, updated_at)
      SELECT id, name, description, metadata_json, organization_id, project_id, created_at, updated_at FROM datasets;
    DROP TABLE datasets;
    ALTER TABLE datasets_tenant_scoped RENAME TO datasets;`);
    await db.exec('COMMIT;');
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}

async function migrateNotificationPreferenceScope(db) {
  const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notification_preferences'");
  if (!table?.sql || (/organization_id\s+TEXT\s+NOT\s+NULL/i.test(table.sql) && /PRIMARY\s+KEY\s*\(event_type, organization_id, project_id\)/i.test(table.sql))) return;
  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.exec('BEGIN IMMEDIATE;');
    await db.exec(`CREATE TABLE notification_preferences_scoped (
      event_type TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, channels_json TEXT NOT NULL DEFAULT '["studio"]',
      threshold REAL, organization_id TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_type, organization_id, project_id)
    );
    INSERT OR IGNORE INTO notification_preferences_scoped (event_type, enabled, channels_json, threshold, organization_id, project_id, updated_at)
      SELECT event_type, enabled, channels_json, threshold, organization_id_key, project_id_key, updated_at FROM (
        SELECT event_type, enabled, channels_json, threshold,
          COALESCE(organization_id, '') AS organization_id_key,
          COALESCE(project_id, '') AS project_id_key,
          updated_at,
          ROW_NUMBER() OVER (
            PARTITION BY event_type, COALESCE(organization_id, ''), COALESCE(project_id, '')
            ORDER BY updated_at DESC, rowid DESC
          ) AS row_rank
        FROM notification_preferences
      )
      WHERE row_rank = 1;
    DROP TABLE notification_preferences;
    ALTER TABLE notification_preferences_scoped RENAME TO notification_preferences;`);
    await db.exec('COMMIT;');
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}

async function migrateWorkspaceNameConstraint(db) {
  const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'");
  if (!table?.sql || !/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(table.sql)) return;
  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.exec('BEGIN IMMEDIATE;');
    await db.exec(`CREATE TABLE workspaces_tenant_scoped (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, visibility TEXT DEFAULT 'Private', language TEXT DEFAULT 'TypeScript',
      description TEXT, tags TEXT DEFAULT '[]', is_archived INTEGER DEFAULT 0, anomalies_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, organization_id TEXT, project_id TEXT
    );
    INSERT INTO workspaces_tenant_scoped SELECT id, name, path, visibility, language, description, tags, is_archived, anomalies_count, created_at, updated_at, organization_id, project_id FROM workspaces;
    DROP TABLE workspaces;
    ALTER TABLE workspaces_tenant_scoped RENAME TO workspaces;`);
    await db.exec('COMMIT;');
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}

async function migrateAgentStatusConstraint(db) {
  const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agents'");
  // New databases use CREATE_TABLES_SQL above. Existing databases need a table
  // rebuild because SQLite cannot alter a CHECK constraint in place.
  if (!table?.sql || (/'blocked'/i.test(table.sql) && /'completed'/i.test(table.sql))) return;

  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.exec('BEGIN IMMEDIATE;');
    await db.exec(`CREATE TABLE agents_with_terminal_status (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'completed', 'blocked', 'error', 'terminated', 'apoptosis', 'Active', 'Apoptosis')),
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
      FOREIGN KEY (parent_agent_id) REFERENCES agents_with_terminal_status(id) ON DELETE SET NULL
    );
    INSERT INTO agents_with_terminal_status (
      id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id,
      hallucination_monitoring, hallucination_count, model_tier, language, isolation_mode,
      parent_agent_id, lineage_relation, about, current_task, created_at, updated_at
    ) SELECT
      id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id,
      hallucination_monitoring, hallucination_count, model_tier, language, isolation_mode,
      parent_agent_id, lineage_relation, about, current_task, created_at, updated_at
    FROM agents;
    DROP TABLE agents;
    ALTER TABLE agents_with_terminal_status RENAME TO agents;`);
    await db.exec('COMMIT;');
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}

async function migrateLineageNodeTypeConstraint(db) {
  const table = await db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'lineage_nodes'");
  if (!table?.sql || /'speculative_merozoite'/.test(table.sql)) return;

  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.exec('BEGIN IMMEDIATE;');
    await db.exec(`CREATE TABLE lineage_nodes_with_reproduction_types (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      agent_id TEXT,
      snapshot_id TEXT,
      label TEXT NOT NULL,
      node_type TEXT NOT NULL CHECK (node_type IN ('core', 'agent', 'skill', 'checkpoint', 'fork', 'merge', 'mitosis', 'binary_fission', 'budding', 'schizogony', 'meiosis', 'speculative_merozoite', 'lysed_schizont')),
      score REAL DEFAULT 0.0,
      visits INTEGER DEFAULT 0,
      state_summary TEXT,
      pos_x REAL DEFAULT 0,
      pos_y REAL DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO lineage_nodes_with_reproduction_types (
      id, workspace_id, agent_id, snapshot_id, label, node_type, score, visits,
      state_summary, pos_x, pos_y, metadata, created_at
    ) SELECT
      id, workspace_id, agent_id, snapshot_id, label, node_type, score, visits,
      state_summary, pos_x, pos_y, metadata, created_at
    FROM lineage_nodes;
    DROP TABLE lineage_nodes;
    ALTER TABLE lineage_nodes_with_reproduction_types RENAME TO lineage_nodes;`);
    await db.exec('COMMIT;');
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    throw error;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}


module.exports = { migrateLegacySchema, applyVersionedMigrations, migrateNotificationPreferenceScope, migrateLineageNodeTypeConstraint };
