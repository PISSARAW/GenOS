const TABLES_MODEL_ATTEMPTS = `CREATE TABLE IF NOT EXISTS model_attempt_ledger (
  id TEXT PRIMARY KEY,
  mission_id TEXT,
  action_id TEXT NOT NULL,
  organization_id TEXT,
  project_id TEXT,
  agent_id TEXT,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_called INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER,
  output_tokens INTEGER,
  token_usage_source TEXT NOT NULL DEFAULT 'unknown',
  cost_usd REAL,
  estimated_cost_usd REAL,
  budget_reservation_id TEXT,
  error_code TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  CHECK (token_usage_source IN ('provider', 'estimate', 'unknown', 'not_called'))
);
CREATE TABLE IF NOT EXISTS model_budget_reservations (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  cost_ceiling_usd REAL,
  token_ceiling INTEGER,
  reserved_cost_usd REAL NOT NULL,
  reserved_tokens INTEGER NOT NULL,
  actual_cost_usd REAL,
  actual_tokens INTEGER,
  status TEXT NOT NULL CHECK (status IN ('active', 'uncertain', 'settled', 'released')),
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_model_budget_reservation_scope
  ON model_budget_reservations(scope_id, status);`;

module.exports = { TABLES_MODEL_ATTEMPTS };
