/**
 * GenOS SQLite Database Connection Singleton
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { initializeSchema } = require('./schema');
const { seedDatabase } = require('./seed');

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
  const previous = transactionTails.get(db) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  transactionTails.set(db, previous.then(() => current));
  await previous;
  await db.exec('BEGIN TRANSACTION;');
  try {
    const result = await callback(db);
    await db.exec('COMMIT;');
    return result;
  } catch (err) {
    await db.exec('ROLLBACK;');
    throw err;
  } finally {
    release();
  }
}

module.exports = {
  getDatabase,
  closeDatabase,
  withTransaction
};
