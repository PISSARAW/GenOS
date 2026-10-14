'use strict';

async function migrateAgentIdentity(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agent_identity_births (
      agent_id TEXT PRIMARY KEY, source_table TEXT NOT NULL,
      birth_kind TEXT NOT NULL, initial_json TEXT, retired INTEGER NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS agent_identity_changes (
      change_id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
      change_json TEXT NOT NULL, applied_revision INTEGER);
    CREATE TABLE IF NOT EXISTS agent_identity_encounters (
      observer_id TEXT NOT NULL, nonce TEXT NOT NULL, operation_id TEXT NOT NULL,
      presentation_hash TEXT NOT NULL, receipt_json TEXT NOT NULL,
      PRIMARY KEY(observer_id, nonce), UNIQUE(observer_id, operation_id));
    CREATE TABLE IF NOT EXISTS agent_identity_heads (
      agent_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
      kind TEXT NOT NULL, source_table TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      head_hash TEXT, incarnation_id TEXT, owner_id TEXT, fencing_token INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER NOT NULL DEFAULT 0, session_key_hash TEXT,
      life_state TEXT NOT NULL DEFAULT 'alive');
    CREATE TABLE IF NOT EXISTS agent_identity_events (
      event_hash TEXT PRIMARY KEY, agent_id TEXT NOT NULL, revision INTEGER NOT NULL,
      previous_hash TEXT, event_type TEXT NOT NULL, idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL, body_json TEXT NOT NULL,
      UNIQUE(agent_id, revision), UNIQUE(agent_id, idempotency_key));
    CREATE TRIGGER IF NOT EXISTS identity_events_no_update BEFORE UPDATE ON agent_identity_events
      BEGIN SELECT RAISE(ABORT, 'IDENTITY_EVENT_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS identity_events_no_delete BEFORE DELETE ON agent_identity_events
      BEGIN SELECT RAISE(ABORT, 'IDENTITY_EVENT_IMMUTABLE'); END;
    CREATE TABLE IF NOT EXISTS agent_identity_peer_claims (
      observer_id TEXT NOT NULL, peer_id TEXT NOT NULL, claim_key TEXT NOT NULL,
      source_kind TEXT NOT NULL, value_json TEXT NOT NULL, evidence_hash TEXT NOT NULL,
      confidence REAL, observed_at TEXT NOT NULL, PRIMARY KEY(observer_id, peer_id, claim_key, source_kind));
    CREATE TABLE IF NOT EXISTS agent_identity_decisions (
      decision_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, incarnation_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL, self_head TEXT NOT NULL, peer_id TEXT, peer_head TEXT,
      domain TEXT NOT NULL, prediction REAL, outcome INTEGER, attribution TEXT,
      dimensions_json TEXT NOT NULL, request_hash TEXT NOT NULL, result_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS agent_identity_checkpoints (
      checkpoint_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, head_hash TEXT NOT NULL,
      revision INTEGER NOT NULL, content_hash TEXT NOT NULL, coverage_json TEXT NOT NULL,
      anchor_kind TEXT NOT NULL DEFAULT 'capture');
    CREATE TABLE IF NOT EXISTS agent_identity_keys (
      key_id TEXT PRIMARY KEY, secret TEXT NOT NULL);
  `);
  for (const [table, column] of [['agents', 'id'], ['daemon_runtime_state', 'daemon_id']]) {
    const exists = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table);
    if (!exists) continue;
    const columns = new Set((await db.all(`PRAGMA table_info(${table})`)).map(row => row.name));
    const fields = ['name', 'role', 'model_tier', 'status', 'is_apoptotic', 'workspace_id', 'parent_agent_id',
      'health', 'cognitive_revisions'].filter(field => columns.has(field));
    const initial = fields.flatMap(field => [`'${field}'`, `NEW.${field}`]).join(',');
    await db.exec(`INSERT OR IGNORE INTO agent_identity_births(agent_id, source_table, birth_kind)
      SELECT ${column}, '${table}', 'legacy_import' FROM ${table};
      CREATE TRIGGER IF NOT EXISTS identity_reuse_${table} BEFORE INSERT ON ${table}
        WHEN EXISTS (SELECT 1 FROM agent_identity_births WHERE agent_id = NEW.${column} AND retired = 1)
        BEGIN SELECT RAISE(ABORT, 'IDENTITY_ID_REUSE'); END;
      CREATE TRIGGER IF NOT EXISTS identity_id_${table} BEFORE UPDATE OF ${column} ON ${table}
        WHEN NEW.${column} IS NOT OLD.${column}
        BEGIN SELECT RAISE(ABORT, 'IDENTITY_ID_IMMUTABLE'); END;
      CREATE TRIGGER IF NOT EXISTS identity_delete_${table} AFTER DELETE ON ${table}
        BEGIN UPDATE agent_identity_births SET retired = 1 WHERE agent_id = OLD.${column};
          UPDATE agent_identity_heads SET life_state = 'terminal', lease_until = 0 WHERE agent_id = OLD.${column};
          INSERT INTO agent_identity_changes(agent_id, change_json) VALUES (OLD.${column}, '{"deleted":true}'); END;
      CREATE TRIGGER IF NOT EXISTS identity_replace_${table} AFTER INSERT ON ${table}
        WHEN EXISTS (SELECT 1 FROM agent_identity_heads WHERE agent_id = NEW.${column})
        BEGIN UPDATE agent_identity_heads SET life_state = 'terminal', lease_until = 0 WHERE agent_id = NEW.${column};
          INSERT INTO agent_identity_changes(agent_id, change_json) VALUES (NEW.${column}, '{"replaced":true}'); END;
      CREATE TRIGGER IF NOT EXISTS identity_birth_${table} AFTER INSERT ON ${table}
      BEGIN INSERT OR IGNORE INTO agent_identity_births(agent_id, source_table, birth_kind, initial_json)
        VALUES (NEW.${column}, '${table}', 'registered_birth', json_object(${initial})); END;`);
    await createChangeTrigger(db, { table, column, fields });
  }
}

async function createChangeTrigger(db, input) {
  if (!input.fields.length) return;
  const when = input.fields.map(field => `OLD.${field} IS NOT NEW.${field}`).join(' OR ');
  const values = input.fields.flatMap(field => [`'${field}'`,
    `json_object('before', OLD.${field}, 'after', NEW.${field})`]).join(',');
  await db.exec(`CREATE TRIGGER IF NOT EXISTS identity_change_${input.table} AFTER UPDATE ON ${input.table}
    WHEN ${when} BEGIN INSERT INTO agent_identity_changes(agent_id, change_json)
      VALUES (NEW.${input.column}, json_object(${values})); END;`);
}

module.exports = { migrateAgentIdentity };
