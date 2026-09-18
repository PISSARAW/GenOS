async function ensureColumn({ db, table, column, definition }) {
  const columns = await db.all(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrateEpistemicEvents(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS epistemic_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    emitted_at DATETIME NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    organization_id TEXT,
    project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_epistemic_events_type_time ON epistemic_events(event_type, emitted_at);
  CREATE TABLE IF NOT EXISTS epistemic_claims (
    id TEXT PRIMARY KEY,
    subject TEXT,
    claim_json TEXT NOT NULL,
    quality REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    revision INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT,
    project_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_epistemic_claims_subject ON epistemic_claims(subject, status);`);
  await ensureColumn({ db, table: 'epistemic_events', column: 'organization_id', definition: 'TEXT' });
  await ensureColumn({ db, table: 'epistemic_events', column: 'project_id', definition: 'TEXT' });
  await ensureColumn({ db, table: 'epistemic_claims', column: 'revision', definition: 'INTEGER NOT NULL DEFAULT 0' });
  await ensureColumn({ db, table: 'epistemic_claims', column: 'organization_id', definition: 'TEXT' });
  await ensureColumn({ db, table: 'epistemic_claims', column: 'project_id', definition: 'TEXT' });
  await db.exec(`CREATE TABLE IF NOT EXISTS epistemic_claim_revisions (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    before_quality REAL NOT NULL,
    after_quality REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(claim_id, revision)
  );
  CREATE INDEX IF NOT EXISTS idx_epistemic_claim_revisions_claim ON epistemic_claim_revisions(claim_id, revision);`);
}

module.exports = { migrateEpistemicEvents };
