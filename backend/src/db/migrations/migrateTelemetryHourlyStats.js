module.exports = {
  async run(db) {
    await db.exec(`
CREATE TABLE IF NOT EXISTS telemetry_hourly_stats (
    organization_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    bucket_hour TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    events INTEGER NOT NULL DEFAULT 0,
    tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    latency_ms_total REAL NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (organization_id, project_id, bucket_hour, agent_id, model)
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS trg_telemetry_hourly_stats_ai
AFTER INSERT ON telemetry_events
BEGIN
    INSERT INTO telemetry_hourly_stats (organization_id, project_id, bucket_hour, agent_id, model, events, tokens, cost_usd, latency_ms_total, errors)
    VALUES (
        COALESCE(new.organization_id, ''),
        COALESCE(new.project_id, ''),
        substr(new.created_at, 1, 13) || ':00:00',
        COALESCE(new.agent_id, ''),
        COALESCE(json_extract(new.payload_json, '$.model'), ''),
        1,
        COALESCE(json_extract(new.payload_json, '$.tokens'), 0) + COALESCE(json_extract(new.payload_json, '$.totalTokens'), 0) + COALESCE(json_extract(new.payload_json, '$.usage.total_tokens'), 0),
        COALESCE(json_extract(new.payload_json, '$.costUsd'), 0.0),
        COALESCE(json_extract(new.payload_json, '$.latencyMs'), 0.0),
        CASE WHEN new.severity IN ('error', 'critical') THEN 1 ELSE 0 END
    )
    ON CONFLICT(organization_id, project_id, bucket_hour, agent_id, model) DO UPDATE SET
        events = events + 1,
        tokens = tokens + COALESCE(json_extract(new.payload_json, '$.tokens'), 0) + COALESCE(json_extract(new.payload_json, '$.totalTokens'), 0) + COALESCE(json_extract(new.payload_json, '$.usage.total_tokens'), 0),
        cost_usd = cost_usd + COALESCE(json_extract(new.payload_json, '$.costUsd'), 0.0),
        latency_ms_total = latency_ms_total + COALESCE(json_extract(new.payload_json, '$.latencyMs'), 0.0),
        errors = errors + CASE WHEN new.severity IN ('error', 'critical') THEN 1 ELSE 0 END;
END;

CREATE TRIGGER IF NOT EXISTS trg_telemetry_hourly_stats_ad
AFTER DELETE ON telemetry_events
BEGIN
    UPDATE telemetry_hourly_stats SET
        events = events - 1,
        tokens = tokens - COALESCE(json_extract(old.payload_json, '$.tokens'), 0) - COALESCE(json_extract(old.payload_json, '$.totalTokens'), 0) - COALESCE(json_extract(old.payload_json, '$.usage.total_tokens'), 0),
        cost_usd = cost_usd - COALESCE(json_extract(old.payload_json, '$.costUsd'), 0.0),
        latency_ms_total = latency_ms_total - COALESCE(json_extract(old.payload_json, '$.latencyMs'), 0.0),
        errors = errors - CASE WHEN old.severity IN ('error', 'critical') THEN 1 ELSE 0 END
    WHERE organization_id = COALESCE(old.organization_id, '')
      AND project_id = COALESCE(old.project_id, '')
      AND bucket_hour = substr(old.created_at, 1, 13) || ':00:00'
      AND agent_id = COALESCE(old.agent_id, '')
      AND model = COALESCE(json_extract(old.payload_json, '$.model'), '');
END;
`);
  }
};
