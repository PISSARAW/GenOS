pub(super) const SQL: &str = "
CREATE TABLE IF NOT EXISTS rust_protocol_runs (
 run_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, generation INTEGER NOT NULL,
 workspace TEXT NOT NULL, policy_hash TEXT NOT NULL, request_hash TEXT NOT NULL,
 binding_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'admitted'
);
CREATE TABLE IF NOT EXISTS rust_protocol_current (
 mission_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, generation INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rust_protocol_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL,
 protocol TEXT NOT NULL, phase TEXT NOT NULL, payload_json TEXT NOT NULL,
 digest TEXT NOT NULL
);
";
