const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();

async function fix() {
  const db = await open({ filename: './genos.db', driver: sqlite3.Database });
  await db.exec('ALTER TABLE workspaces ADD COLUMN isolated INTEGER DEFAULT 0');
  console.log('Added isolated column');
  await db.close();
}

fix().catch(console.error);