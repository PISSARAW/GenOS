const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();

async function check() {
  const db = await open({ filename: './genos.db', driver: sqlite3.Database });
  const rows = await db.all('SELECT * FROM schema_migrations WHERE version LIKE "033%"');
  console.log('Migration 033:', rows);
  const cols = await db.all('PRAGMA table_info(workspaces)');
  const isolated = cols.find(c => c.name === 'isolated');
  console.log('isolated column:', isolated);
  await db.close();
}

check().catch(console.error);