const { migrationRunners, runMigration } = require('./migrations/registry');
const { migrateAgentStatusConstraint } = require('./migrations/migrateAgentStatusConstraint');
const { migrateLineageNodeTypeConstraint } = require('./migrations/migrateLineageNodeTypeConstraint');
const { migrateWorkspaceNameConstraint } = require('./migrations/migrateWorkspaceNameConstraint');
const { migrateDatasetNameConstraint } = require('./migrations/migrateDatasetNameConstraint');
const { migrateNotificationPreferenceScope } = require('./migrations/migrateNotificationPreferenceScope');
const { migrateEpisodicColumns } = require('./migrations/migrateEpisodicColumns');
const { migrateSynapseColumns } = require('./migrations/migrateSynapseColumns');
const { migrateWorkflowVersions } = require('./migrations/migrateWorkflowVersions');
const { migrateTenantScopes } = require('./migrations/migrateTenantScopes');
const { migrateCryptobiosis } = require('./migrations/migrateCryptobiosis');
const { migrateEvaluationColumns } = require('./migrations/migrateEvaluationColumns');
const { migrateIdeClient } = require('./migrations/migrateIdeClient');
const { migratePriorityColumns } = require('./migrations/migratePriorityColumns');
const { migrateEventIdIndex } = require('./migrations/migrateEventIdIndex');
const { migrateSynapseIndexes } = require('./migrations/migrateSynapseIndexes');

async function applyVersionedMigrations(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS episodic_memories (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, session_id TEXT, task_id TEXT,
    turn_number INTEGER DEFAULT 0, action_type TEXT, context_state TEXT DEFAULT '{}',
    action_input TEXT, observation_output TEXT, reward_score REAL DEFAULT 0.0,
    is_consolidated INTEGER DEFAULT 0, is_purged INTEGER NOT NULL DEFAULT 0,
    purged_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_episodic_agent_session ON episodic_memories (agent_id, session_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_episodic_consolidated ON episodic_memories (is_consolidated, created_at);
  CREATE INDEX IF NOT EXISTS idx_conscience_transitions_agent_rev ON conscience_transitions(agent_id, to_revision);
  CREATE INDEX IF NOT EXISTS idx_conscience_transitions_created ON conscience_transitions(created_at);`);

  await db.exec(`CREATE TABLE IF NOT EXISTS plasmid_bindings (
    plasmid_id TEXT PRIMARY KEY, owner_agent_id TEXT, source_agent_id TEXT,
    organization_id TEXT, project_id TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'superseded')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_plasmid_bindings_owner ON plasmid_bindings(owner_agent_id, status);
  CREATE INDEX IF NOT EXISTS idx_plasmid_bindings_scope ON plasmid_bindings(organization_id, project_id);`);

  await db.exec(`CREATE TABLE IF NOT EXISTS agent_state_snapshots (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, workspace_id TEXT, state_json TEXT NOT NULL,
    reason TEXT, commit_message TEXT, parent_snapshot_id TEXT, ref_name TEXT DEFAULT 'main',
    created_by TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_agent_state_snapshots_agent ON agent_state_snapshots(agent_id, created_at);`);

  const agentSnapshotColumns = new Set((await db.all('PRAGMA table_info(agent_state_snapshots)')).map((column) => column.name));
  if (!agentSnapshotColumns.has('commit_message')) await db.exec('ALTER TABLE agent_state_snapshots ADD COLUMN commit_message TEXT');
  if (!agentSnapshotColumns.has('parent_snapshot_id')) await db.exec('ALTER TABLE agent_state_snapshots ADD COLUMN parent_snapshot_id TEXT');
  if (!agentSnapshotColumns.has('ref_name')) await db.exec("ALTER TABLE agent_state_snapshots ADD COLUMN ref_name TEXT DEFAULT 'main'");

  await db.exec(`CREATE TABLE IF NOT EXISTS agent_git_objects (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, workspace_id TEXT, object_kind TEXT NOT NULL CHECK (object_kind IN ('commit', 'stash', 'tag', 'remote')),
    ref_name TEXT, remote_name TEXT, state_hash TEXT NOT NULL, state_json TEXT NOT NULL, metadata_json DEFAULT '{}',
    created_by TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_agent_git_objects_agent ON agent_git_objects(agent_id, object_kind, created_at);
  CREATE INDEX IF NOT EXISTS idx_agent_git_objects_remote ON agent_git_objects(remote_name, state_hash);`);

  const agentGitColumns = new Set((await db.all('PRAGMA table_info(agent_git_objects)')).map((column) => column.name));
  if (!agentGitColumns.has('signature')) await db.exec('ALTER TABLE agent_git_objects ADD COLUMN signature TEXT');

  await db.exec(`CREATE TABLE IF NOT EXISTS agent_git_refs (ref_key TEXT PRIMARY KEY, agent_id TEXT NOT NULL, ref_name TEXT NOT NULL, object_id TEXT, version INTEGER NOT NULL DEFAULT 0, lease_token TEXT, tracking_remote TEXT, tracking_ref TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(agent_id, ref_name));
  CREATE TABLE IF NOT EXISTS agent_git_reflog (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, ref_name TEXT NOT NULL, old_object_id TEXT, new_object_id TEXT, action TEXT NOT NULL, actor TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS agent_git_notes (id TEXT PRIMARY KEY, object_id TEXT NOT NULL, agent_id TEXT NOT NULL, note_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS agent_git_hooks (hook_key TEXT PRIMARY KEY, agent_id TEXT NOT NULL, hook_name TEXT NOT NULL, policy_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS agent_git_archives (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, object_id TEXT NOT NULL, archive_hash TEXT NOT NULL, archive_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);

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
  await db.exec(`CREATE TABLE IF NOT EXISTS cryptobiosis_snapshots (snapshot_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, workspace_id TEXT, capsule_hash TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('freezing', 'frozen', 'thawing', 'thawed', 'failed')), metadata_json TEXT NOT NULL DEFAULT '{}', frozen_at DATETIME DEFAULT CURRENT_TIMESTAMP, thawed_at DATETIME, FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL)`);
  if (cryptobiosisColumns.size && !cryptobiosisColumns.has('snapshot_id')) {
    await db.exec(`INSERT OR IGNORE INTO cryptobiosis_snapshots (snapshot_id, agent_id, workspace_id, capsule_hash, status, metadata_json, frozen_at, thawed_at) SELECT id, COALESCE(json_extract(state_json, '$.agentId'), id), workspace_id, 'legacy:' || id, CASE WHEN thawed_at IS NULL THEN 'frozen' ELSE 'thawed' END, json_object('legacy', 1, 'reason', reason, 'state_json', state_json), frozen_at, thawed_at FROM cryptobiosis_snapshots_legacy`);
    await db.exec('DROP TABLE cryptobiosis_snapshots_legacy');
  }
  const cryptoColsNow = new Set((await db.all('PRAGMA table_info(cryptobiosis_snapshots)')).map(column => column.name));
  if (!cryptoColsNow.has('id')) await db.exec('ALTER TABLE cryptobiosis_snapshots ADD COLUMN id TEXT');
  if (!cryptoColsNow.has('reason')) await db.exec('ALTER TABLE cryptobiosis_snapshots ADD COLUMN reason TEXT');
  if (!cryptoColsNow.has('state_json')) await db.exec('ALTER TABLE cryptobiosis_snapshots ADD COLUMN state_json TEXT');
  if (!cryptoColsNow.has('thawed_by')) await db.exec('ALTER TABLE cryptobiosis_snapshots ADD COLUMN thawed_by TEXT');

  await migrateWorkspaceNameConstraint(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS workflow_versions (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, version INTEGER NOT NULL, graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}', metadata_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE, UNIQUE(workflow_id, version)); INSERT OR IGNORE INTO workflow_versions (id, workflow_id, version, graph_json, metadata_json, created_at) SELECT 'wfv-' || id, id, version, graph_json, metadata_json, COALESCE(updated_at, CURRENT_TIMESTAMP) FROM workflows; CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON workflow_versions(workflow_id, version DESC);`);

  const organizationCount = await db.get('SELECT COUNT(*) AS count FROM organizations');
  const organization = Number(organizationCount?.count) === 1 ? await db.get('SELECT id FROM organizations LIMIT 1') : null;
  const projectColumns = await db.all('PRAGMA table_info(projects)');
  if (!projectColumns.some((column) => column.name === 'status')) await db.exec("ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  if (organization) {
    await db.run('INSERT OR IGNORE INTO projects (id, organization_id, name) VALUES (?, ?, ?)', `project-${organization.id}`, organization.id, 'default');
    await db.run('UPDATE OR IGNORE workspaces SET organization_id = COALESCE(organization_id, ?), project_id = COALESCE(project_id, ?) WHERE organization_id IS NULL OR project_id IS NULL', organization.id, `project-${organization.id}`);
  }
  await db.run(`UPDATE global_alerts
    SET organization_id = (SELECT organization_id FROM workspaces WHERE workspaces.name = global_alerts.workspace_name GROUP BY workspaces.name HAVING COUNT(*) = 1),
        project_id = (SELECT project_id FROM workspaces WHERE workspaces.name = global_alerts.workspace_name GROUP BY workspaces.name HAVING COUNT(*) = 1)
    WHERE organization_id IS NULL OR project_id IS NULL`);
  await migrateTenantScopes(db);

  const evaluationColumns = await db.all('PRAGMA table_info(evaluation_jobs)');
  const evaluationNames = new Set(evaluationColumns.map(column => column.name));
  if (!evaluationNames.has('error_json')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN error_json TEXT');
  if (!evaluationNames.has('attempts')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
  if (!evaluationNames.has('max_attempts')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3');
  if (!evaluationNames.has('campaign_id')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN campaign_id TEXT');
  await migrateEvaluationColumns(db);

  await migrateEpisodicColumns(db);
  await migrateSynapseColumns(db);
  await migrateWorkflowVersions(db);
  await migrateCryptobiosis(db);
  await migrateTenantScopes(db);

  const ideColumns = new Set((await db.all('PRAGMA table_info(ide_integrations)')).map(column => column.name));
  if (!ideColumns.has('client_id')) await db.exec('ALTER TABLE ide_integrations ADD COLUMN client_id TEXT');
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_ide_client_workspace ON ide_integrations(client_id, workspace_id) WHERE client_id IS NOT NULL');
  await migrateIdeClient(db);

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
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_runs_queue ON workflow_runs(status, priority DESC, created_at ASC); CREATE INDEX IF NOT EXISTS idx_evaluation_jobs_queue ON evaluation_jobs(status, priority DESC, created_at ASC); CREATE INDEX IF NOT EXISTS idx_model_jobs_queue ON model_jobs(status, priority DESC, created_at ASC); CREATE INDEX IF NOT EXISTS idx_synapses_target ON memory_synapses(target_id); CREATE INDEX IF NOT EXISTS idx_synapses_weight ON memory_synapses(weight); CREATE INDEX IF NOT EXISTS idx_synapses_pruning ON memory_synapses(c3_opsonization, cd47_expression); CREATE INDEX IF NOT EXISTS idx_synapses_tenant ON memory_synapses(organization_id, project_id); CREATE INDEX IF NOT EXISTS idx_provenance_payload_hash ON provenance_records(payload_hash); CREATE INDEX IF NOT EXISTS idx_provenance_parent_hash ON provenance_records(parent_hash);`);
  await migrateSynapseIndexes(db);

  for (const runner of migrationRunners) {
    await runMigration(db, runner.name, runner.description);
  }
}

module.exports = {
  applyVersionedMigrations,
  migrateLegacySchema,
  migrateNotificationPreferenceScope
};

async function migrateLegacySchema(db) {}
