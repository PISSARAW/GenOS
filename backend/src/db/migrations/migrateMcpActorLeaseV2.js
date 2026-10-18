'use strict';

async function columnNames(db) {
  const rows = await db.all('PRAGMA table_info(mcp_actor_capabilities)');
  return new Set(rows.map((row) => row.name));
}

async function addBudgetColumns(db) {
  const columns = await columnNames(db);
  if (!columns.has('max_calls')) {
    await db.exec('ALTER TABLE mcp_actor_capabilities ADD COLUMN max_calls INTEGER');
  }
  if (!columns.has('calls_used')) {
    await db.exec('ALTER TABLE mcp_actor_capabilities ADD COLUMN calls_used INTEGER NOT NULL DEFAULT 0');
  }
}

async function migrateMcpActorLeaseV2(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mcp_actor_capabilities (
    token_hash TEXT PRIMARY KEY, agent_id TEXT NOT NULL, run_id TEXT NOT NULL,
    authority_hash TEXT NOT NULL, workspace_root TEXT NOT NULL,
    expires_at TEXT NOT NULL, revoked_at TEXT,
    max_calls INTEGER, calls_used INTEGER NOT NULL DEFAULT 0
  );`);
  await addBudgetColumns(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS mcp_actor_lease_receipts (
    receipt_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('issue','decision','revocation','observation')),
    disposition TEXT NOT NULL CHECK(disposition IN
      ('active','allow','refuse','revoked','technical_success','technical_failure')),
    reason TEXT NOT NULL,
    tool_name TEXT,
    action_id TEXT,
    authority_hash TEXT NOT NULL,
    workspace_root TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(token_hash, sequence),
    FOREIGN KEY(token_hash) REFERENCES mcp_actor_capabilities(token_hash) ON DELETE RESTRICT
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_actor_lease_receipts_token
    ON mcp_actor_lease_receipts(token_hash, sequence);
  CREATE TRIGGER IF NOT EXISTS mcp_actor_lease_receipts_immutable
  BEFORE UPDATE ON mcp_actor_lease_receipts
  BEGIN
    SELECT RAISE(ABORT, 'MCP_ACTOR_LEASE_RECEIPT_IMMUTABLE');
  END;
  CREATE TRIGGER IF NOT EXISTS mcp_actor_lease_receipts_no_delete
  BEFORE DELETE ON mcp_actor_lease_receipts
  BEGIN
    SELECT RAISE(ABORT, 'MCP_ACTOR_LEASE_RECEIPT_IMMUTABLE');
  END;`);
}

module.exports = { migrateMcpActorLeaseV2 };
