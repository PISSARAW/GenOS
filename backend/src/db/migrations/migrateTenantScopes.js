async function migrateTenantScopes(db) {
  for (const table of [
    'prompts', 'datasets', 'rag_documents', 'integrations', 'workflows', 'workflow_runs',
    'experiments', 'global_alerts', 'webhook_subscriptions', 'secrets', 'platform_approvals',
    'audit_logs', 'compliance_reports', 'agent_permissions', 'releases', 'model_jobs',
    'evaluation_jobs', 'evaluation_runs', 'provenance_records', 'notification_preferences',
    'genome_decisions', 'memory_synapses', 'trace_spans', 'telemetry_events'
  ]) {
    const columns = await db.all(`PRAGMA table_info(${table})`);
    const columnNames = new Set(columns.map(column => column.name));
    if (!columnNames.has('organization_id')) await db.exec(`ALTER TABLE ${table} ADD COLUMN organization_id TEXT`);
    if (!columnNames.has('project_id')) await db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT`);
    if (table === 'trace_spans' && !columnNames.has('workspace_id')) await db.exec('ALTER TABLE trace_spans ADD COLUMN workspace_id TEXT');
    if (table === 'evaluation_jobs' && !columnNames.has('claimed_at')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN claimed_at DATETIME');
    if (table === 'evaluation_jobs' && !columnNames.has('next_attempt_at')) await db.exec('ALTER TABLE evaluation_jobs ADD COLUMN next_attempt_at DATETIME');
  }
  await db.run(`UPDATE global_alerts
    SET organization_id = (SELECT organization_id FROM workspaces WHERE workspaces.name = global_alerts.workspace_name GROUP BY workspaces.name HAVING COUNT(*) = 1),
        project_id = (SELECT project_id FROM workspaces WHERE workspaces.name = global_alerts.workspace_name GROUP BY workspaces.name HAVING COUNT(*) = 1)
    WHERE organization_id IS NULL OR project_id IS NULL`);
}

module.exports = { migrateTenantScopes };
