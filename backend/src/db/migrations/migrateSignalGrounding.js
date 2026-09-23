'use strict';

/**
 * Migration 048 — grounding zero-text sur signal_deliveries (Phase 7).
 *
 * Étend le mécanisme de delivery existant au lieu d'en créer un second :
 * status reste le cycle transport (pending/delivered/seen/acked),
 * grounding_level porte le niveau cognitif (none/transport_ack/
 * semantic_ack/action_ack/verified_ack/human_confirmation).
 * Aucun ACK ne contient de texte libre ni ne réveille de LLM.
 */

const GROUNDING_COLUMNS = [
  ['grounding_level', "TEXT NOT NULL DEFAULT 'none'"],
  ['semantic_hash', 'TEXT'],
  ['evidence_hash', 'TEXT'],
  ['contract_version', 'TEXT'],
  ['grounded_at', 'DATETIME'],
  ['verified_at', 'DATETIME']
];

async function migrateSignalGrounding(db) {
  const deliveries = await db.all('PRAGMA table_info(signal_deliveries)');
  const names = new Set((deliveries || []).map((col) => col.name));
  if (names.size === 0) return;
  for (const [name, type] of GROUNDING_COLUMNS) {
    if (!names.has(name)) {
      await db.exec(`ALTER TABLE signal_deliveries ADD COLUMN ${name} ${type}`);
    }
  }
  await db.exec(`UPDATE signal_deliveries SET grounding_level = CASE status
    WHEN 'delivered' THEN 'transport_ack'
    WHEN 'seen' THEN 'semantic_ack'
    WHEN 'acked' THEN 'action_ack'
    ELSE 'none' END
    WHERE grounding_level = 'none'`);
  await db.exec('CREATE INDEX IF NOT EXISTS idx_signal_grounding_level ON signal_deliveries(signal_id, grounding_level)');
}

module.exports = { migrateSignalGrounding };
