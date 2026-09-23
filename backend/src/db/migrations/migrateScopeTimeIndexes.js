const INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_telemetry_scope_time ON telemetry_events(organization_id, project_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_telemetry_agent_event_time ON telemetry_events(agent_id, event_type, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_scope_time ON audit_logs(organization_id, project_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_trace_scope_trace_time ON trace_spans(organization_id, project_id, trace_id, start_time)`,
  `CREATE INDEX IF NOT EXISTS idx_trace_created ON trace_spans(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_workspace_status ON agents(workspace_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_agent_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_lineage_edges_source_target ON lineage_edges(source_node_id, target_node_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lineage_edges_target_source ON lineage_edges(target_node_id, source_node_id)`,
  `CREATE INDEX IF NOT EXISTS idx_continuation_agent_pending ON continuation_queue(agent_id, available_at, created_at) WHERE status = 'pending'`,
  `CREATE INDEX IF NOT EXISTS idx_comm_outcomes_sender_time ON communication_outcomes(sender_id, created_at DESC, outcome)`,
  `CREATE INDEX IF NOT EXISTS idx_daemon_findings_active ON daemon_findings(territory_id, updated_at DESC) WHERE status NOT IN ('REFUTED', 'EXPIRED')`,
  `CREATE INDEX IF NOT EXISTS idx_daemon_findings_expiry ON daemon_findings(territory_id, expires_at) WHERE expires_at IS NOT NULL`,
];

module.exports = {
  async run(db) {
    for (const stmt of INDEX_STATEMENTS) {
      await db.exec(stmt);
    }
  }
};
