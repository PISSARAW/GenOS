/**
 * GenOS SQLite Database Connection Singleton
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { initializeSchema } = require('./schema');
const { seedDatabase } = require('./seed');

const sqliteVec = require('sqlite-vec');
const { AsyncLocalStorage } = require('async_hooks');

let dbInstance = null;
let currentDbPath = null;
let dbInitialization = null;
const transactionTails = new WeakMap();
const transactionStorage = new AsyncLocalStorage();

async function getDatabase(dbFilePath) {
  const defaultPath = process.env.GENOS_DB_PATH || path.resolve(__dirname, '../../genos.db');
  const filename = dbFilePath ? path.resolve(dbFilePath) : path.resolve(defaultPath);

  if (dbInstance) {
    if (currentDbPath === filename) {
      return dbInstance;
    }
    await closeDatabase();
  }

  // Requests may reach the backend while it is still bootstrapping.  Reuse the
  // same connection/bootstrap promise instead of running two seed passes in
  // parallel inside one Node process.
  if (dbInitialization) return dbInitialization;

  dbInitialization = (async () => {
    const db = await open({
      filename,
      driver: sqlite3.Database
    });
    try {
      sqliteVec.load(db.db);
    } catch (err) {
      console.warn('[DB] sqlite-vec extension could not be loaded:', err.message);
    }

    try {
      await initializeSchema(db);
      await seedDatabase(db);
      dbInstance = db;
      currentDbPath = filename;
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
    currentDbPath = null;
  }
}

async function withTransaction(db, callback) {
  const activeTxDb = transactionStorage.getStore();
  if (activeTxDb === db) {
    return await callback(db);
  }

  const currentTail = transactionTails.get(db) || Promise.resolve();
  let release;
  const nextTail = new Promise(resolve => {
    release = resolve;
  });
  transactionTails.set(db, currentTail.then(() => nextTail, () => nextTail));

  await currentTail;
  try {
    await db.exec('BEGIN IMMEDIATE;');
    try {
      const result = await transactionStorage.run(db, () => callback(db));
      await db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        await db.exec('ROLLBACK;');
      } catch (_) {}
      throw err;
    }
  } finally {
    release();
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
  withTransaction
};
