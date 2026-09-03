/**
 * GenOS Database Schema Definition
 * 18 Normalized SQLite Tables + Performance Indexes
 *
 * Split across schema-tables-core / schema-tables-extensions /
 * schema-migrations to keep every file under the 400-line gate.
 */

const { TABLES_CORE } = require("./schema-tables-core");
const { TABLES_EXTENSIONS, CREATE_INDEXES_SQL } = require("./schema-tables-extensions");
const { migrateLegacySchema, applyVersionedMigrations } = require("./schema-migrations");

const CREATE_TABLES_SQL = TABLES_CORE + "\n" + TABLES_EXTENSIONS;

async function initializeSchema(db) {
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA busy_timeout = 5000;');
  await db.exec('PRAGMA synchronous = NORMAL;');
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec('PRAGMA mmap_size = 30000000000;'); // Memory-map up to 30GB of the DB file
  await db.exec('PRAGMA temp_store = MEMORY;'); // Use RAM for temp tables and indices
  await migrateLegacySchema(db);
  await db.exec(CREATE_TABLES_SQL);
  await applyVersionedMigrations(db);
  await db.run('INSERT OR IGNORE INTO resilience_policies (id) VALUES (1)');
  for (const eventType of ['error', 'cognitive_drift', 'budget', 'blocked', 'human_escalation']) {
    await db.run('INSERT OR IGNORE INTO notification_preferences (event_type) VALUES (?)', eventType);
  }
  await db.exec(CREATE_INDEXES_SQL);

  // Initialize FTS5 Virtual Tables for Vector/BM25 Hybrid Search
  await db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS trajectories_fts USING fts5(
        id UNINDEXED, title, summary, tags, author
    );
    CREATE TRIGGER IF NOT EXISTS trajectories_ai AFTER INSERT ON trajectories BEGIN
        INSERT INTO trajectories_fts(rowid, id, title, summary, tags, author) 
        VALUES (new.rowid, new.id, new.title, new.semantic_summary, new.status, new.author_name);
    END;
    CREATE TRIGGER IF NOT EXISTS trajectories_ad AFTER DELETE ON trajectories BEGIN
        DELETE FROM trajectories_fts WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS trajectories_au AFTER UPDATE ON trajectories BEGIN
        UPDATE trajectories_fts SET 
            id = new.id, title = new.title, summary = new.semantic_summary, 
            tags = new.status, author = new.author_name
        WHERE rowid = old.rowid;
    END;

    CREATE VIRTUAL TABLE IF NOT EXISTS genome_decisions_fts USING fts5(
        id UNINDEXED, title, summary, tags, author
    );
    CREATE TRIGGER IF NOT EXISTS genome_decisions_ai AFTER INSERT ON genome_decisions BEGIN
        INSERT INTO genome_decisions_fts(rowid, id, title, summary, tags, author) 
        VALUES (new.rowid, new.id, new.title, new.content, new.category, new.created_by);
    END;
    CREATE TRIGGER IF NOT EXISTS genome_decisions_ad AFTER DELETE ON genome_decisions BEGIN
        DELETE FROM genome_decisions_fts WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS genome_decisions_au AFTER UPDATE ON genome_decisions BEGIN
        UPDATE genome_decisions_fts SET 
            id = new.id, title = new.title, summary = new.content, 
            tags = new.category, author = new.created_by
        WHERE rowid = old.rowid;
    END;
  `);
  
  // Initialize vec0 Virtual Tables for Native Vector Search
  await db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS trajectories_vec USING vec0(
        embedding float[768]
    );
    CREATE TRIGGER IF NOT EXISTS trajectories_vec_ai AFTER INSERT ON trajectories BEGIN
        INSERT INTO trajectories_vec(rowid, embedding) VALUES (new.rowid, new.embedding_blob);
    END;
    CREATE TRIGGER IF NOT EXISTS trajectories_vec_ad AFTER DELETE ON trajectories BEGIN
        DELETE FROM trajectories_vec WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS trajectories_vec_au AFTER UPDATE ON trajectories BEGIN
        UPDATE trajectories_vec SET embedding = new.embedding_blob WHERE rowid = old.rowid;
    END;

    CREATE VIRTUAL TABLE IF NOT EXISTS genome_decisions_vec USING vec0(
        embedding float[768]
    );
    CREATE TRIGGER IF NOT EXISTS genome_decisions_vec_ai AFTER INSERT ON genome_decisions BEGIN
        INSERT INTO genome_decisions_vec(rowid, embedding) VALUES (new.rowid, new.embedding_blob);
    END;
    CREATE TRIGGER IF NOT EXISTS genome_decisions_vec_ad AFTER DELETE ON genome_decisions BEGIN
        DELETE FROM genome_decisions_vec WHERE rowid = old.rowid;
    END;
    CREATE TRIGGER IF NOT EXISTS genome_decisions_vec_au AFTER UPDATE ON genome_decisions BEGIN
        UPDATE genome_decisions_vec SET embedding = new.embedding_blob WHERE rowid = old.rowid;
    END;
  `);

  // Rebuild the FTS and VEC indexes if they are empty but core tables have data
  const trajectoriesFtsCount = await db.get("SELECT COUNT(*) as c FROM trajectories_fts");
  if (trajectoriesFtsCount.c === 0) {
      await db.exec(`
          INSERT INTO trajectories_fts(rowid, id, title, summary, tags, author) 
          SELECT rowid, id, title, semantic_summary, status, author_name FROM trajectories;
          INSERT INTO trajectories_vec(rowid, embedding)
          SELECT rowid, embedding_blob FROM trajectories WHERE embedding_blob IS NOT NULL;
      `);
  }
  const genomeFtsCount = await db.get("SELECT COUNT(*) as c FROM genome_decisions_fts");
  if (genomeFtsCount.c === 0) {
      await db.exec(`
          INSERT INTO genome_decisions_fts(rowid, id, title, summary, tags, author) 
          SELECT rowid, id, title, content, category, created_by FROM genome_decisions;
          INSERT INTO genome_decisions_vec(rowid, embedding)
          SELECT rowid, embedding_blob FROM genome_decisions WHERE embedding_blob IS NOT NULL;
      `);
  }
}

module.exports = {
  initializeSchema,
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL
};
