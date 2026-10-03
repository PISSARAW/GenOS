'use strict';

const migratedDatabases = new WeakSet();

/**
 * Migration 041 — payload JSON sur le journal daemon (ADR 0034 D8).
 *
 * Les détecteurs de l'investigateur ont besoin de localiser les
 * signaux (fichier, scope, head). Le payload est déclaratif
 * (file, scope, headSha...) — jamais une conclusion.
 */

async function migrateDaemonEventPayload(db) {
  if (!db || (typeof db !== 'object' && typeof db !== 'function')) return;
  if (migratedDatabases.has(db)) return;
  const columns = await db.all('PRAGMA table_info(daemon_events)');
  const hasPayload = (columns || []).some((col) => col.name === 'payload_json');
  if (!hasPayload) {
    await db.exec("ALTER TABLE daemon_events ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'");
  }
  migratedDatabases.add(db);
}

module.exports = { migrateDaemonEventPayload };
