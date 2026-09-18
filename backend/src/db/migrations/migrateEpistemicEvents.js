async function migrateEpistemicEvents(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS epistemic_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    emitted_at DATETIME NOT NULL,
    fingerprint TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_epistemic_events_type_time ON epistemic_events(event_type, emitted_at);
  CREATE TABLE IF NOT EXISTS epistemic_claims (
    id TEXT PRIMARY KEY,
    subject TEXT,
    claim_json TEXT NOT NULL,
    quality REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_epistemic_claims_subject ON epistemic_claims(subject, status);`);
}

module.exports = { migrateEpistemicEvents };
