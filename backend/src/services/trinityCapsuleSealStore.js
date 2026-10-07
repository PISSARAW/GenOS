const { hash, fail } = require('./trinityCapsulePaths');

async function initialize(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS trinity_capsule_seals (
    correlation_hash TEXT PRIMARY KEY, seal_hash TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS trinity_capsule_seals_no_update BEFORE UPDATE ON trinity_capsule_seals
      BEGIN SELECT RAISE(ABORT, 'capsule seals are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS trinity_capsule_seals_no_delete BEFORE DELETE ON trinity_capsule_seals
      BEGIN SELECT RAISE(ABORT, 'capsule seals are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS trinity_capsule_seals_no_replace BEFORE INSERT ON trinity_capsule_seals
      WHEN EXISTS(SELECT 1 FROM trinity_capsule_seals WHERE correlation_hash = NEW.correlation_hash)
      BEGIN SELECT RAISE(ABORT, 'capsule seals are immutable'); END;`);
}

async function assertStored(context, capsule) {
  if (!context.db) return;
  await initialize(context.db);
  const row = await context.db.get('SELECT seal_hash FROM trinity_capsule_seals WHERE correlation_hash = ?', hash(capsule.correlation));
  if (!row || row.seal_hash !== capsule.sealHash) fail('Capsule database seal anchor mismatch.');
}

async function persist(context, capsule) {
  if (!context.db) return;
  await initialize(context.db);
  await context.db.run('INSERT INTO trinity_capsule_seals(correlation_hash, seal_hash) VALUES (?, ?)', hash(capsule.correlation), capsule.sealHash);
  await assertStored(context, capsule);
}

module.exports = { initialize, assertStored, persist };
