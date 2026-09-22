const path = require('path');
const repoRoot = path.resolve(__dirname, '../..');
// Use genos_self_scan's proven require pattern
const { getDatabase, closeDatabase } = require(path.join(repoRoot, 'backend/src/db'));

async function run() {
  const db = await getDatabase();
  console.log('DB_PATH:', process.env.GENOS_DB_PATH || path.join(repoRoot, 'backend', 'genos.db'));

  try {
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('TABLES:', JSON.stringify(tables.map(t => t.name)));
  } catch(e) { console.log('TABLES query failed:', e.message); }

  try {
    const orgs = await db.all("SELECT id, description, status FROM orchestrators ORDER BY id");
    console.log('ORGS:', JSON.stringify(orgs));
  } catch(e) { console.log('ORGS query failed:', e.message); }

  try {
    const msgs = await db.all("SELECT id, orchestrator_id, sender_id, mission, state, created_at FROM worker_inbox_messages ORDER BY id DESC LIMIT 5");
    console.log('MSGS:', JSON.stringify(msgs));
  } catch(e) { console.log('MSGS query failed:', e.message); }

  await closeDatabase();
}

run().catch(e => { console.error(e.stack || e.message); process.exit(1); });
