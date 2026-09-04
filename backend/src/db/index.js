/**
 * GenOS SQLite Database Connection Singleton
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { initializeSchema } = require('./schema');
const { seedDatabase } = require('./seed');

const sqliteVec = require('sqlite-vec');

let dbInstance = null;
let dbInitialization = null;
const transactionTails = new WeakMap();

async function getDatabase(dbFilePath) {
  if (dbInstance) {
    return dbInstance;
  }

  // Requests may reach the backend while it is still bootstrapping.  Reuse the
  // same connection/bootstrap promise instead of running two seed passes in
  // parallel inside one Node process.
  if (dbInitialization) return dbInitialization;

  const defaultPath = process.env.GENOS_DB_PATH || path.resolve(__dirname, '../../genos.db');
  const filename = dbFilePath || defaultPath;

  dbInitialization = (async () => {
    const db = await open({
      filename,
      driver: sqlite3.Database
    });
    sqliteVec.load(db.db);

    // Optimisations d'architecture (Single-writer, WAL, Timeout)
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('PRAGMA busy_timeout = 5000');
    await db.exec('PRAGMA mmap_size = 268435456');
    await db.exec('PRAGMA synchronous = NORMAL');

    try {
      await initializeSchema(db);
      await seedDatabase(db);
      dbInstance = db;
      return dbInstance;
    } catch (error) {
      await db.close();
      throw error;
    } finally {
      dbInitialization = null;
    }
  })();

  return dbInitialization;
}

async function closeDatabase() {
  if (dbInitialization) {
    try { await dbInitialization; } catch (_) {}
  }
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

async function withTransaction(db, callback) {
  // Laisse SQLite gérer la concurrence via WAL et busy_timeout
  await db.exec('BEGIN TRANSACTION;');
  try {
    const result = await callback(db);
    await db.exec('COMMIT;');
    return result;
  } catch (err) {
    await db.exec('ROLLBACK;');
    throw err;
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
  withTransaction
};
