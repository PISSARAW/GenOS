'use strict';

/**
 * Migration 038 — journal des événements territoriaux (ADR 0034 D4).
 *
 * Table daemon_events : chaque événement ingéré par le
 * DaemonEventBridge est persisté (type, priorité, woke oui/non).
 * C'est la matière première de l'interoception du territoire :
 * change_rate, test_failure_pressure, handoff_demand, etc. sont
 * DÉRIVÉS de ce journal, jamais inventés.
 *
 * Pas de FK stricte vers daemon_territories : le bridge ingère
 * par territoryId déclaré ; un événement orphelin reste requêtable
 * pour le Reconciler (D13), pas rejeté silencieusement.
 */

async function migrateDaemonEvents(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      territory_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'low'
        CHECK (priority IN ('low', 'medium', 'high')),
      woke INTEGER NOT NULL DEFAULT 0,
      handoff_requested INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_events_territory
      ON daemon_events(territory_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_daemon_events_type
      ON daemon_events(event_type, created_at);
  `);
}

module.exports = { migrateDaemonEvents };
