async function ensureTables(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scientific_dependency_edges (
      consumer_key TEXT NOT NULL,
      dependency_key TEXT NOT NULL,
      consumer_ref_json TEXT NOT NULL,
      dependency_ref_json TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active', 'stale')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (consumer_key, dependency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_scientific_dependency_inverse
      ON scientific_dependency_edges(dependency_key, state);
    CREATE TABLE IF NOT EXISTS scientific_obligations (
      obligation_id TEXT PRIMARY KEY,
      consumer_key TEXT NOT NULL,
      dependency_key TEXT NOT NULL,
      consumer_agent_id TEXT,
      state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'satisfied', 'stale')),
      satisfaction_receipt_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_scientific_obligations_dependency
      ON scientific_obligations(dependency_key, state);
    CREATE TABLE IF NOT EXISTS scientific_suspensions (
      consumer_key TEXT NOT NULL,
      origin_key TEXT NOT NULL,
      retraction_receipt_id TEXT NOT NULL,
      retraction_receipt_digest TEXT NOT NULL,
      reason TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'stale' CHECK(state IN ('stale', 'cleared')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (consumer_key, origin_key, retraction_receipt_id)
    );
    CREATE TABLE IF NOT EXISTS scientific_outbox (
      event_id TEXT PRIMARY KEY,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL CHECK(event_type IN ('publish', 'retract', 'invalidate')),
      subject_key TEXT NOT NULL,
      subject_ref_json TEXT NOT NULL,
      recipient_agent_id TEXT,
      payload_json TEXT NOT NULL,
      priority INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'claimed', 'acked')),
      claimed_by TEXT,
      claim_token TEXT,
      claimed_until_ms INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      acked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scientific_outbox_claim
      ON scientific_outbox(state, priority DESC, created_at);
  `);
  const columns = await db.all('PRAGMA table_info(scientific_outbox)');
  if (!columns.some((column) => column.name === 'next_attempt_ms')) {
    await db.exec('ALTER TABLE scientific_outbox ADD COLUMN next_attempt_ms INTEGER NOT NULL DEFAULT 0');
  }
}

module.exports = { ensureTables };
