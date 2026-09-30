'use strict';

async function migrateEpistemicImmuneMemory(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS epistemic_immune_memory (
    signature TEXT PRIMARY KEY,
    pattern_json TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'general',
    evidence_json TEXT,
    effective_response_json TEXT,
    affinity REAL NOT NULL DEFAULT 0.5,
    failures INTEGER NOT NULL DEFAULT 0,
    successes INTEGER NOT NULL DEFAULT 0,
    pending INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_epistemic_immune_memory_domain
    ON epistemic_immune_memory(domain, affinity DESC);
  CREATE INDEX IF NOT EXISTS idx_epistemic_immune_memory_updated
    ON epistemic_immune_memory(updated_at);`);
}

const { migrationRunners } = require('./registry');
migrationRunners.push({
  name: '086-epistemic-immune-memory',
  description: 'Persist AEIS immune memory patterns and oracle outcomes',
  run: migrateEpistemicImmuneMemory,
});

module.exports = { migrateEpistemicImmuneMemory };
