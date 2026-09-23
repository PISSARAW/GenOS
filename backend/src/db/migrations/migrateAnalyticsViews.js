module.exports = {
  async run(db) {
    await db.exec(`
CREATE VIEW IF NOT EXISTS v_job_queue_health AS
SELECT
    'workflow_runs' AS queue_name,
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
    SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    MAX(created_at) AS oldest_created_at
FROM workflow_runs
UNION ALL
SELECT
    'evaluation_jobs',
    COUNT(*),
    SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END),
    SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END),
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END),
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
    MAX(created_at)
FROM evaluation_jobs
UNION ALL
SELECT
    'model_jobs',
    COUNT(*),
    SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END),
    SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END),
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END),
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
    MAX(created_at)
FROM model_jobs;

CREATE VIEW IF NOT EXISTS v_agent_operational_state AS
SELECT
    a.id,
    a.name,
    a.status,
    a.role,
    a.parent_agent_id,
    a.workspace_id,
    a.organization_id,
    a.project_id,
    a.created_at,
    a.updated_at,
    COALESCE(SUM(CASE WHEN t.event_type LIKE '%ERROR%' OR t.severity = 'error' THEN 1 ELSE 0 END), 0) AS error_count,
    COALESCE(SUM(CASE WHEN t.event_type LIKE '%COMPLETED%' THEN 1 ELSE 0 END), 0) AS completion_count,
    COALESCE(SUM(CASE WHEN t.event_type LIKE '%EUREKA%' THEN 1 ELSE 0 END), 0) AS eureka_count
FROM agents a
LEFT JOIN telemetry_events t ON t.agent_id = a.id
GROUP BY a.id;

CREATE VIEW IF NOT EXISTS v_communication_efficiency AS
SELECT
    sender_id,
    outcome,
    COUNT(*) AS total,
    AVG(json_extract(payload_json, '$.latencyMs')) AS avg_latency_ms,
    MAX(created_at) AS last_communication_at
FROM communication_outcomes
GROUP BY sender_id, outcome;

CREATE VIEW IF NOT EXISTS v_uplift_pairs_enriched AS
SELECT
    u.id,
    u.run_id,
    u.control_agent_id,
    u.treatment_agent_id,
    u.control_outcome,
    u.treatment_outcome,
    u.delta,
    u.created_at,
    c.name AS control_agent_name,
    t.name AS treatment_agent_name
FROM uplift_pairs u
LEFT JOIN agents c ON c.id = u.control_agent_id
LEFT JOIN agents t ON t.id = u.treatment_agent_id;
`);
  }
};
