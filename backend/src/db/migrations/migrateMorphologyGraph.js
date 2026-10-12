'use strict';

async function migrateMorphologyGraph(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS morphology_graph_versions (
      graph_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      mission_id TEXT,
      status TEXT NOT NULL,
      parent_version INTEGER,
      graph_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (graph_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_morphology_graph_mission
      ON morphology_graph_versions(mission_id, created_at);
    CREATE TRIGGER IF NOT EXISTS morphology_graph_versions_no_update
      BEFORE UPDATE ON morphology_graph_versions
      BEGIN SELECT RAISE(ABORT, 'morphology graph version is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS morphology_graph_versions_no_delete
      BEFORE DELETE ON morphology_graph_versions
      BEGIN SELECT RAISE(ABORT, 'morphology graph version is immutable'); END;
  `);
}

module.exports = { migrateMorphologyGraph };
