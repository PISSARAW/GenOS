const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();

async function check() {
  const db = await open({ filename: './genos.db', driver: sqlite3.Database });
  const ws = await db.get('SELECT * FROM workspaces WHERE id = "ws-test-identity"');
  console.log('Workspace ws-test-identity:', ws);
  await db.close();
}

check().catch(console.error);