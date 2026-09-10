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
  if (dbFilePath) {
    const targetPath = path.resolve(dbFilePath);
    process.env.GENOS_DB_PATH = targetPath;
    if (dbInstance) {
      if (currentDbPath === targetPath) {
        return dbInstance;
      }
      await closeDatabase();
    }
  } else if (dbInstance) {
    return dbInstance;
  }

  const defaultPath = process.env.GENOS_DB_PATH || path.resolve(__dirname, '../../genos.db');
  const filename = dbFilePath ? path.resolve(dbFilePath) : path.resolve(defaultPath);

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

async function withWriteRetry(fn, options = {}) {
  const maxRetries = Number(process.env.GENOS_SQLITE_MAX_RETRIES) || options.maxRetries || 5;
  const baseDelay = options.baseDelayMs || 50;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLock = err?.code === 'SQLITE_BUSY' || /busy|locked/i.test(err?.message || '');
      if (!isLock || attempt === maxRetries) {
        throw err;
      }
      const delay = Math.min(1000, baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * 50);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
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
    await withWriteRetry(() => db.exec('BEGIN IMMEDIATE;'));
    try {
      const result = await transactionStorage.run(db, () => callback(db));
      await withWriteRetry(() => db.exec('COMMIT;'));
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
  withTransaction,
  withWriteRetry
};
