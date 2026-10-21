'use strict';

/**
 * Journal durable du passage finding Daemon -> tâche Ontogenèse.
 * La proposition reste consultative ; l'exécution conserve toutes les
 * barrières d'autorité, de vérification et d'intégration d'Ontogenèse.
 */
async function migrateOntogenesisDaemonStewardship(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ontogenesis_daemon_proposals (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE,
      territory_id TEXT NOT NULL,
      finding_id TEXT NOT NULL,
      head_sha TEXT NOT NULL,
      task_id TEXT UNIQUE REFERENCES ontogenesis_backlog(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'PROPOSED'
        CHECK (status IN ('PROPOSED', 'ENQUEUED', 'INTEGRATED', 'FAILED', 'STALE')),
      priority INTEGER NOT NULL,
      proposal_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, finding_id, head_sha)
    );
    CREATE INDEX IF NOT EXISTS idx_onto_daemon_proposals_project
      ON ontogenesis_daemon_proposals(project_id, status, priority DESC);
    CREATE INDEX IF NOT EXISTS idx_onto_daemon_proposals_territory
      ON ontogenesis_daemon_proposals(territory_id, head_sha, finding_id);
  `);
}

module.exports = { migrateOntogenesisDaemonStewardship };
