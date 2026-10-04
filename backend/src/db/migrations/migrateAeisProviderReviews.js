'use strict';

async function migrateAeisProviderReviews(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS aeis_provider_reviews (
    id TEXT PRIMARY KEY,
    scope_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    antigen_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    status TEXT NOT NULL,
    verdict TEXT,
    response_digest TEXT,
    process_id INTEGER,
    duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_aeis_provider_reviews_run
    ON aeis_provider_reviews(scope_id, run_id, antigen_id);`);
}

module.exports = { migrateAeisProviderReviews };
