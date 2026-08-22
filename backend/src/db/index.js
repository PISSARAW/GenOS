/**
 * GenOS SQLite Database Connection Singleton
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { initializeSchema } = require('./schema');
const { seedDatabase } = require('./seed');

let dbInstance = null;

async function getDatabase(dbFilePath) {
  if (dbInstance) {
    return dbInstance;
  }

  const defaultPath = process.env.GENOS_DB_PATH || path.resolve(__dirname, '../../genos.db');
  const filename = dbFilePath || defaultPath;

  const db = await open({
    filename,
    driver: sqlite3.Database
  });

  await initializeSchema(db);
  await seedDatabase(db);

  dbInstance = db;
  return dbInstance;
}

async function closeDatabase() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

async function withTransaction(db, callback) {
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
