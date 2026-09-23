module.exports = {
  async run(db) {
    await db.exec(`
CREATE VIEW IF NOT EXISTS v_telemetry_normalized AS
SELECT
    id,
    organization_id,
    project_id,
    agent_id,
    event_type,
    severity,
    created_at,
    json_extract(payload_json, '$.model') AS model,
    COALESCE(json_extract(payload_json, '$.tokens'), 0)
      + COALESCE(json_extract(payload_json, '$.totalTokens'), 0)
      + COALESCE(json_extract(payload_json, '$.usage.total_tokens'), 0)
      AS token_count,
    COALESCE(json_extract(payload_json, '$.costUsd'), 0.0) AS cost_usd,
    COALESCE(json_extract(payload_json, '$.latencyMs'), 0.0) AS latency_ms
FROM telemetry_events;
`);
  }
};
