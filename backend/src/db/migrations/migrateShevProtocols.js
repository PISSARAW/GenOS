'use strict';

async function addColumn(db, input) {
  const columns = await db.all(`PRAGMA table_info(${input.table})`);
  if (!columns.some((column) => column.name === input.name)) {
    await db.exec(`ALTER TABLE ${input.table} ADD COLUMN ${input.name} ${input.definition}`);
  }
}

async function migrateShevProtocols(db) {
  await addColumn(db, { table: 'shev_responsibilities', name: 'stage',
    definition: "TEXT NOT NULL DEFAULT 'observing'" });
  await addColumn(db, { table: 'shev_responsibilities', name: 'authority_public_key',
    definition: 'TEXT' });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_authorizations (
      nonce TEXT PRIMARY KEY, project_id TEXT NOT NULL, operation TEXT NOT NULL,
      payload_json TEXT NOT NULL, signature TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS shev_authorizations_no_update BEFORE UPDATE ON shev_authorizations
      BEGIN SELECT RAISE(ABORT, 'shev_authorization_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_authorizations_no_delete BEFORE DELETE ON shev_authorizations
      BEGIN SELECT RAISE(ABORT, 'shev_authorization_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_initiative_approvals (
      initiative_id TEXT PRIMARY KEY REFERENCES shev_initiatives(id),
      budget_json TEXT NOT NULL, stop_condition TEXT NOT NULL, alternative TEXT NOT NULL,
      authorization_nonce TEXT NOT NULL REFERENCES shev_authorizations(nonce),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS shev_approvals_no_update BEFORE UPDATE ON shev_initiative_approvals
      BEGIN SELECT RAISE(ABORT, 'shev_approval_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_monitoring (
      id TEXT PRIMARY KEY, initiative_id TEXT NOT NULL REFERENCES shev_initiatives(id),
      observation_id TEXT NOT NULL, result TEXT NOT NULL CHECK (result IN ('confirmed', 'regressed', 'inconclusive')),
      verifier_ref TEXT NOT NULL, evidence_json TEXT NOT NULL,
      assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (initiative_id, observation_id)
    );
    CREATE TRIGGER IF NOT EXISTS shev_monitoring_no_update BEFORE UPDATE ON shev_monitoring
      BEGIN SELECT RAISE(ABORT, 'shev_monitoring_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_watches (
      initiative_id TEXT PRIMARY KEY REFERENCES shev_initiatives(id),
      interval_ms INTEGER NOT NULL, next_due_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'alert'))
    );
    CREATE TABLE IF NOT EXISTS shev_recoveries (
      monitoring_id TEXT PRIMARY KEY REFERENCES shev_monitoring(id),
      status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'executing', 'applied', 'halted')),
      plan_json TEXT NOT NULL, authorization_nonce TEXT REFERENCES shev_authorizations(nonce),
      receipt_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS shev_agent_progress (
      id TEXT PRIMARY KEY, initiative_id TEXT NOT NULL REFERENCES shev_initiatives(id),
      gvx_event_id TEXT NOT NULL UNIQUE, entity_id TEXT NOT NULL,
      result TEXT NOT NULL CHECK (result IN ('confirmed', 'inconclusive', 'regressed')),
      metrics_json TEXT NOT NULL, verifier_ref TEXT NOT NULL, evidence_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS shev_agent_progress_no_update BEFORE UPDATE ON shev_agent_progress
      BEGIN SELECT RAISE(ABORT, 'shev_agent_progress_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_qualitative_calibrations (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, evaluator_id TEXT NOT NULL,
      rubric_version TEXT NOT NULL, mean_absolute_error REAL NOT NULL,
      reference_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS shev_qualitative_judgments (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, observation_id TEXT NOT NULL,
      calibration_id TEXT NOT NULL REFERENCES shev_qualitative_calibrations(id),
      evaluator_id TEXT NOT NULL, audience TEXT NOT NULL, score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 4),
      rationale TEXT NOT NULL, evidence_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS shev_calibrations_no_update BEFORE UPDATE ON shev_qualitative_calibrations
      BEGIN SELECT RAISE(ABORT, 'shev_calibration_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_calibrations_no_delete BEFORE DELETE ON shev_qualitative_calibrations
      BEGIN SELECT RAISE(ABORT, 'shev_calibration_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_judgments_no_update BEFORE UPDATE ON shev_qualitative_judgments
      BEGIN SELECT RAISE(ABORT, 'shev_judgment_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_judgments_no_delete BEFORE DELETE ON shev_qualitative_judgments
      BEGIN SELECT RAISE(ABORT, 'shev_judgment_immutable'); END;
    CREATE TABLE IF NOT EXISTS shev_longitudinal_comparisons (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dimension TEXT NOT NULL,
      protocol_json TEXT NOT NULL, result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER IF NOT EXISTS shev_comparisons_no_update BEFORE UPDATE ON shev_longitudinal_comparisons
      BEGIN SELECT RAISE(ABORT, 'shev_comparison_immutable'); END;
    CREATE TRIGGER IF NOT EXISTS shev_comparisons_no_delete BEFORE DELETE ON shev_longitudinal_comparisons
      BEGIN SELECT RAISE(ABORT, 'shev_comparison_immutable'); END;
  `);
}

module.exports = { migrateShevProtocols };
