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
const { readSqliteMmapSize, readSqliteSynchronous } = require('../services/runtimeConfig');

const CREATE_TABLES_SQL = TABLES_CORE + "\n" + TABLES_EXTENSIONS;

const OPTIONAL_COLUMN_STATEMENTS = [
  'ALTER TABLE rag_chunks ADD COLUMN embedding_blob BLOB;',
  'ALTER TABLE swarm_proposals ADD COLUMN consensus_type TEXT DEFAULT "simple";',
  'ALTER TABLE swarm_proposals ADD COLUMN parent_proposal_id TEXT;',
  'ALTER TABLE swarm_votes ADD COLUMN weight REAL DEFAULT 1.0;',
  'ALTER TABLE swarm_votes ADD COLUMN brier_score REAL;',
  'ALTER TABLE workflow_runs ADD COLUMN claim_token TEXT;',
  'ALTER TABLE evaluation_jobs ADD COLUMN claim_token TEXT;',
  'ALTER TABLE model_jobs ADD COLUMN claim_token TEXT;'
];

async function addOptionalColumns(db, statements) {
  for (const statement of statements) {
    try { await db.exec(statement); } catch (_) {}
  }
}

async function initializeSchema(db) {
  await db.exec('PRAGMA journal_mode = WAL;');
  const busyTimeout = Math.max(1000, Number(process.env.GENOS_SQLITE_BUSY_TIMEOUT_MS) || 30000);
  await db.exec(`PRAGMA busy_timeout = ${busyTimeout};`);
  await db.exec(`PRAGMA synchronous = ${readSqliteSynchronous(process.env.GENOS_SQLITE_SYNCHRONOUS)};`);
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(`PRAGMA mmap_size = ${readSqliteMmapSize(process.env.GENOS_SQLITE_MMAP_SIZE)};`);
  await db.exec('PRAGMA temp_store = MEMORY;'); // Use RAM for temp tables and indices
  await migrateLegacySchema(db);
  await db.exec(CREATE_TABLES_SQL);
  await addOptionalColumns(db, OPTIONAL_COLUMN_STATEMENTS);
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
  try {
    await db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS trajectories_vec USING vec0(
          embedding float[768]
      );
      DROP TRIGGER IF EXISTS trajectories_vec_ai;
      CREATE TRIGGER trajectories_vec_ai AFTER INSERT ON trajectories
      WHEN new.embedding_blob IS NOT NULL AND length(new.embedding_blob) = 3072 BEGIN
          INSERT INTO trajectories_vec(rowid, embedding) VALUES (new.rowid, new.embedding_blob);
      END;
      DROP TRIGGER IF EXISTS trajectories_vec_ad;
      CREATE TRIGGER trajectories_vec_ad AFTER DELETE ON trajectories BEGIN
          DELETE FROM trajectories_vec WHERE rowid = old.rowid;
      END;
      DROP TRIGGER IF EXISTS trajectories_vec_au;
      CREATE TRIGGER trajectories_vec_au AFTER UPDATE ON trajectories BEGIN
          DELETE FROM trajectories_vec WHERE rowid = old.rowid;
          INSERT INTO trajectories_vec(rowid, embedding)
          SELECT new.rowid, new.embedding_blob
          WHERE new.embedding_blob IS NOT NULL AND length(new.embedding_blob) = 3072;
      END;

      CREATE VIRTUAL TABLE IF NOT EXISTS genome_decisions_vec USING vec0(
          embedding float[768]
      );
      DROP TRIGGER IF EXISTS genome_decisions_vec_ai;
      CREATE TRIGGER genome_decisions_vec_ai AFTER INSERT ON genome_decisions
      WHEN new.embedding_blob IS NOT NULL AND length(new.embedding_blob) = 3072 BEGIN
          INSERT INTO genome_decisions_vec(rowid, embedding) VALUES (new.rowid, new.embedding_blob);
      END;
      DROP TRIGGER IF EXISTS genome_decisions_vec_ad;
      CREATE TRIGGER genome_decisions_vec_ad AFTER DELETE ON genome_decisions BEGIN
          DELETE FROM genome_decisions_vec WHERE rowid = old.rowid;
      END;
      DROP TRIGGER IF EXISTS genome_decisions_vec_au;
      CREATE TRIGGER genome_decisions_vec_au AFTER UPDATE ON genome_decisions BEGIN
          DELETE FROM genome_decisions_vec WHERE rowid = old.rowid;
          INSERT INTO genome_decisions_vec(rowid, embedding)
          SELECT new.rowid, new.embedding_blob
          WHERE new.embedding_blob IS NOT NULL AND length(new.embedding_blob) = 3072;
      END;

      CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_vec USING vec0(
          embedding float[768]
      );
      DROP TRIGGER IF EXISTS rag_chunks_vec_ai;
      CREATE TRIGGER rag_chunks_vec_ai AFTER INSERT ON rag_chunks
      WHEN new.embedding_blob IS NOT NULL AND length(new.embedding_blob) = 3072 BEGIN
          INSERT INTO rag_chunks_vec(rowid, embedding) VALUES (new.rowid, new.embedding_blob);
      END;
      DROP TRIGGER IF EXISTS rag_chunks_vec_ad;
      CREATE TRIGGER rag_chunks_vec_ad AFTER DELETE ON rag_chunks BEGIN
          DELETE FROM rag_chunks_vec WHERE rowid = old.rowid;
      END;
      DROP TRIGGER IF EXISTS rag_chunks_vec_au;
      CREATE TRIGGER rag_chunks_vec_au AFTER UPDATE ON rag_chunks BEGIN
          DELETE FROM rag_chunks_vec WHERE rowid = old.rowid;
          INSERT INTO rag_chunks_vec(rowid, embedding)
          SELECT new.rowid, new.embedding_blob
          WHERE new.embedding_blob IS NOT NULL AND length(new.embedding_blob) = 3072;
      END;
    `);
  } catch (err) {
    console.warn('[Schema] Failed to initialize vec0 virtual tables:', err.message);
  }

  await synchronizeSearchIndexes(db);
}

// Full index rebuilds are write-heavy and non-idempotent under concurrency.
// In a cluster only the leader (GENOS_SCHEMA_MAINTENANCE=1) may run them;
// every other worker skips them. Unset (tests / single process) runs them.
const VECTOR_REBUILDS = {
  trajectories: { table: 'trajectories_vec', del: 'DELETE FROM trajectories_vec' },
  genome_decisions: { table: 'genome_decisions_vec', del: 'DELETE FROM genome_decisions_vec' },
  rag_chunks: { table: 'rag_chunks_vec', del: 'DELETE FROM rag_chunks_vec' }
};

async function synchronizeSearchIndexes(db) {
  if (process.env.GENOS_SCHEMA_MAINTENANCE === '0') return;
  await runBestEffort(db, "INSERT INTO trajectories_fts(trajectories_fts) VALUES ('rebuild')");
  await rebuildVector(db, 'trajectories');
  await runBestEffort(db, "INSERT INTO genome_decisions_fts(genome_decisions_fts) VALUES ('rebuild')");
  await rebuildVector(db, 'genome_decisions');
  await rebuildVector(db, 'rag_chunks');
}

async function runBestEffort(db, sql) {
  try {
    await db.exec(sql);
  } catch (err) {
    console.warn('[Schema] Failed to synchronize search index:', err.message);
  }
}

// Rebuilds from source rows so same-cardinality updates cannot leave stale entries.
async function rebuildVector(db, sourceTable) {
  const { table, del } = VECTOR_REBUILDS[sourceTable];
  await runBestEffort(db, del);
  await runBestEffort(db, `INSERT INTO ${table}(rowid, embedding)
      SELECT rowid, embedding_blob FROM ${sourceTable}
      WHERE embedding_blob IS NOT NULL AND length(embedding_blob) = 3072`);
}

module.exports = {
  initializeSchema,
  synchronizeSearchIndexes,
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL
};
