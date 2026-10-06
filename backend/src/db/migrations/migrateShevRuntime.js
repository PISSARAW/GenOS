'use strict';

async function migrateShevRuntime(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_sensors (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES shev_responsibilities(project_id),
      mandate_version INTEGER NOT NULL, adapter TEXT NOT NULL, dimension TEXT NOT NULL,
      config_json TEXT NOT NULL, interval_ms INTEGER NOT NULL, next_due_at TEXT NOT NULL,
      authorization_nonce TEXT NOT NULL REFERENCES shev_authorizations(nonce),
      last_signal_hash TEXT, status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TRIGGER IF NOT EXISTS shev_sensor_contract_no_update
      BEFORE UPDATE OF project_id, mandate_version, adapter, dimension, config_json,
        interval_ms, authorization_nonce ON shev_sensors
      BEGIN SELECT RAISE(ABORT, 'shev_sensor_contract_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_sensor_contract_no_delete BEFORE DELETE ON shev_sensors
      BEGIN SELECT RAISE(ABORT, 'shev_sensor_contract_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_runtime_jobs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, sensor_id TEXT NOT NULL REFERENCES shev_sensors(id),
      phase TEXT NOT NULL, subject_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      actionable INTEGER NOT NULL DEFAULT 1,
      attempts INTEGER NOT NULL DEFAULT 0, observation_id TEXT, receipt_json TEXT,
      started_at TEXT, completed_at TEXT, error TEXT
    );
    CREATE TABLE IF NOT EXISTS shev_development_jobs (
      initiative_id TEXT PRIMARY KEY REFERENCES shev_initiatives(id), project_id TEXT NOT NULL,
      mandate_version INTEGER NOT NULL, scope_json TEXT NOT NULL, budget_json TEXT NOT NULL,
      authorization_nonce TEXT NOT NULL REFERENCES shev_authorizations(nonce),
      status TEXT NOT NULL DEFAULT 'approved', execution_token TEXT, receipt_json TEXT
    );
    CREATE TABLE IF NOT EXISTS shev_longitudinal_protocols (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dimension TEXT NOT NULL,
      protocol_json TEXT NOT NULL, monitoring_cutoff INTEGER NOT NULL,
      authorization_nonce TEXT NOT NULL REFERENCES shev_authorizations(nonce),
      registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TRIGGER IF NOT EXISTS shev_development_contract_no_update
      BEFORE UPDATE OF project_id, mandate_version, scope_json, budget_json, authorization_nonce
        ON shev_development_jobs
      BEGIN SELECT RAISE(ABORT, 'shev_development_contract_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_development_contract_no_delete BEFORE DELETE ON shev_development_jobs
      BEGIN SELECT RAISE(ABORT, 'shev_development_contract_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_protocol_no_update BEFORE UPDATE ON shev_longitudinal_protocols
      BEGIN SELECT RAISE(ABORT, 'shev_protocol_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_protocol_no_delete BEFORE DELETE ON shev_longitudinal_protocols
      BEGIN SELECT RAISE(ABORT, 'shev_protocol_immutable'); END;
  `);
  for (const [name, definition] of [
    ['execution_token', 'TEXT'], ['attempts', 'INTEGER NOT NULL DEFAULT 0']
  ]) {
    const columns = await db.all('PRAGMA table_info(shev_recoveries)');
    if (!columns.some(column => column.name === name)) {
      await db.exec(`ALTER TABLE shev_recoveries ADD COLUMN ${name} ${definition}`);
    }
  }
  for (const table of ['shev_observations', 'shev_effects', 'shev_monitoring', 'shev_agent_progress']) {
    for (const operation of ['UPDATE', 'DELETE']) {
      await db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_${operation.toLowerCase()}
        BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'shev_evidence_immutable'); END;`);
    }
  }
}

module.exports = { migrateShevRuntime };
