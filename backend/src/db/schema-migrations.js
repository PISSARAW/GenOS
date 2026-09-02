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
    ['005-agent-authority', 'Require an orchestrator to dispatch worker agents'],
    ['006-agent-blocked-status', 'Allow guarded agent missions to persist a blocked status'],
    ['007-durable-cryptobiosis', 'Persist cryptobiosis state across backend restarts'],
    ['008-tenant-workspace-names', 'Scope workspace name uniqueness to organization and project'],
    ['009-agent-completed-status', 'Distinguish successful completion from idle availability and blocked termination']
  ];
  await migrateAgentStatusConstraint(db);
  const workspaceColumns = await db.all('PRAGMA table_info(workspaces)');
  const names = new Set(workspaceColumns.map(column => column.name));
  if (!names.has('organization_id')) await db.exec('ALTER TABLE workspaces ADD COLUMN organization_id TEXT');
  if (!names.has('project_id')) await db.exec('ALTER TABLE workspaces ADD COLUMN project_id TEXT');
  await migrateWorkspaceNameConstraint(db);
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


module.exports = { migrateLegacySchema, applyVersionedMigrations };
