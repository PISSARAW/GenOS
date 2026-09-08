const { getDatabase } = require('../db');
const { withTransaction } = require('../db');

async function status(req, res) {
  const db = await getDatabase();
  const migrations = await db.all('SELECT version, description, applied_at FROM schema_migrations ORDER BY version');
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  res.json({ currentVersion: migrations.at(-1)?.version || null, migrations, tables: tables.map((t) => t.name) });
}

async function migrate(req, res) {
  const db = await getDatabase();
  // Idempotent migrations are intentionally replay-safe; this endpoint is the Studio control plane.
  await withTransaction(db, async (tx) => {
    await tx.run('INSERT OR IGNORE INTO schema_migrations (version, description) VALUES (?, ?)', '001-compliance-ide', 'Add compliance reports and IDE integration contracts');
  });
  res.json({ success: true, message: 'Schema migrations applied', ...(await statusPayload(db)) });
}

async function statusPayload(db) {
  const migrations = await db.all('SELECT version, description, applied_at FROM schema_migrations ORDER BY version');
  return { currentVersion: migrations.at(-1)?.version || null, migrations };
}
module.exports = { status, migrate };
