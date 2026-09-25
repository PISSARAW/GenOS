/**
 * GenOS SQLite Database Connection Singleton
 */
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { initializeSchema } = require('./schema');
const { seedDatabase } = require('./seed');
const sqliteVec = require('sqlite-vec');
const { AsyncLocalStorage } = require('async_hooks');
let dbInstance = null;
let currentDbPath = null;
let dbInitialization = null;
let initializingDb = null;
const transactionTails = new WeakMap();
const transactionStorage = new AsyncLocalStorage();
const MAX_DATABASE_BACKUPS = 3;
function configureEpistemicStores(db) {
  require('../services/epistemic/revisionSurface').configureRevisionStore(db);
  require('../services/epistemic/contradictionBus').configureEventStore(db);
}
// N14: best-effort copy of the database file before destructive migrations.
// Never throws: a backup failure must never block the boot sequence.
function backupDatabaseFile(dbPath) {
  try {
    const resolved = path.resolve(dbPath);
    let stat = null;
    try {
      stat = fs.statSync(resolved);
    } catch (_) {
      return null;
    }
    if (!stat.isFile() || stat.size <= 0) return null;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const backupPath = `${resolved}.backup-${stamp}`;
    fs.copyFileSync(resolved, backupPath);
    pruneDatabaseBackups(resolved);
    return backupPath;
  } catch (error) {
    console.warn('[DB] Pre-migration backup failed (continuing boot):', error.message);
    return null;
  }
}
function pruneDatabaseBackups(resolvedDbPath) {
  try {
    const directory = path.dirname(resolvedDbPath);
    const prefix = `${path.basename(resolvedDbPath)}.backup-`;
    const backups = fs.readdirSync(directory).filter((name) => name.startsWith(prefix)).sort();
    while (backups.length > MAX_DATABASE_BACKUPS) {
      const oldest = backups.shift();
      try {
        fs.unlinkSync(path.join(directory, oldest));
      } catch (_) {}
    }
  } catch (error) {
    console.warn('[DB] Backup pruning failed (continuing boot):', error.message);
  }
}
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
    initializingDb = db;
    try {
      sqliteVec.load(db.db);
    } catch (err) {
      console.warn('[DB] sqlite-vec extension could not be loaded:', err.message);
    }
    const skipBootstrap = process.env.GENOS_DB_BOOTSTRAP_SKIP === '1';
    // Reduce SQLITE_BUSY under concurrent writers (bridge + spawned runtime,
    // multiple agents): wait longer instead of failing immediately, and prefer WAL.
    try {
      await configureConnectionPragmas(db, skipBootstrap);
    } catch (pragmaError) {
      console.warn('[DB] Could not apply SQLite pragmas:', pragmaError.message);
    }
    // Best-effort pre-migration backup — must never block boot or starve a
    // concurrent writer (e.g. a freshly spawned worker that needs its own
    // connection). A failure is logged once and the boot continues.
    if (!skipBootstrap && process.env.GENOS_DB_BACKUP_SKIP !== '1') {
      try {
        backupDatabaseFile(filename);
      } catch (backupError) {
        console.warn('[DB] Pre-migration backup skipped:', backupError.message);
      }
    }
    if (!skipBootstrap) {
      await initializeSchema(db);
      await seedDatabase(db);
    }
    configureEpistemicStores(db);
    // Initialisation best-effort du persister d'état adaptatif hors-process
    // (Q-values, attractions, stigmergie, registres MCP) : ne jamais bloquer le boot.
    if (!skipBootstrap) {
      try { await require('./adaptiveStateBootstrap').ensureAdaptivePersister(); } catch (_) {}
    }
    dbInstance = db;
    currentDbPath = filename;
    initializingDb = null;
    return dbInstance;
  })();
  try {
    return await dbInitialization;
  } catch (error) {
    dbInitialization = null;
    if (initializingDb) {
      await initializingDb.close().catch(() => {});
      initializingDb = null;
    }
    throw error;
  }
}

async function configureConnectionPragmas(db, skipBootstrap) {
  const busyTimeout = Math.max(1000, Number(process.env.GENOS_SQLITE_BUSY_TIMEOUT_MS) || 30000);
  await db.exec(`PRAGMA busy_timeout = ${busyTimeout};`);
  // The parent initializes the journal mode. Reapplying it from each worker
  // can contend during startup; workers only need a per-connection timeout.
  if (!skipBootstrap) await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA synchronous = NORMAL;');
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
function isLockError(err) {
  if (err?.code === 'SQLITE_BUSY') return true;
  return /busy|locked/i.test(err?.message || '');
}
function retryDelayMs(attempt, baseDelay) {
  return Math.min(1000, baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * 50);
}
async function withWriteRetry(fn, options = {}) {
  const maxRetries = Number(process.env.GENOS_SQLITE_MAX_RETRIES) || options.maxRetries || 5;
  const baseDelay = options.baseDelayMs || 50;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isLockError(err) || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt, baseDelay)));
    }
  }
}
async function withTransaction(db, callback) {
  const activeTxDb = transactionStorage.getStore();
  if (activeTxDb === db) {
    return await callback(db);
  }
  // Lightweight/mocked connections may not expose exec(); run without an
  // explicit transaction rather than throwing. Real sqlite connections do.
  if (typeof db.exec !== 'function') {
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
      // ROLLBACK can itself hit SQLITE_BUSY. Without a retry the connection
      // stays inside the transaction and every later BEGIN fails with
      // "cannot start a transaction within a transaction".
      try {
        await withWriteRetry(() => db.exec('ROLLBACK;'));
      } catch (rollbackError) {
        console.error('[DB] ROLLBACK failed; connection may be stuck in a transaction:', rollbackError.message);
      }
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
  withWriteRetry,
  backupDatabaseFile
};
