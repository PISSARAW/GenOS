'use strict';

async function migrateHolobiontMemory(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS holobiont_memories (
      memory_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      source_holobiont_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('MISSION', 'WORKSPACE', 'PROJECT', 'PERSISTENT')),
      mission_id TEXT,
      workspace_id TEXT,
      project_id TEXT,
      memory_type TEXT NOT NULL CHECK (memory_type IN (
        'EPISODIC', 'PROCEDURAL', 'PARTNER_REPUTATION', 'IMMUNE', 'LINEAGE', 'HOST_CONTINUITY'
      )),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'RETRACTED')),
      content_json TEXT NOT NULL CHECK (json_valid(content_json)),
      data_classes_json TEXT NOT NULL CHECK (json_valid(data_classes_json)),
      evidence_refs_json TEXT NOT NULL CHECK (json_valid(evidence_refs_json)),
      immune_review_json TEXT NOT NULL CHECK (json_valid(immune_review_json)),
      author_id TEXT,
      reason TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (memory_id, revision),
      FOREIGN KEY (source_holobiont_id) REFERENCES holobiont_sessions(holobiont_id) ON DELETE RESTRICT,
      CHECK (scope != 'MISSION' OR mission_id IS NOT NULL),
      CHECK (scope != 'WORKSPACE' OR workspace_id IS NOT NULL),
      CHECK (scope != 'PROJECT' OR project_id IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_holobiont_memories_host_scope
      ON holobiont_memories(host_id, scope, memory_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_holobiont_memories_source
      ON holobiont_memories(source_holobiont_id, memory_id, revision);

    CREATE TRIGGER IF NOT EXISTS holobiont_memories_no_update
      BEFORE UPDATE ON holobiont_memories
      BEGIN SELECT RAISE(ABORT, 'holobiont_memories is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS holobiont_memories_no_delete
      BEFORE DELETE ON holobiont_memories
      BEGIN SELECT RAISE(ABORT, 'holobiont_memories is append-only'); END;
  `);
}

module.exports = { migrateHolobiontMemory };
