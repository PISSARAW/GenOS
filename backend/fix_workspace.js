const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();

async function fix() {
  const db = await open({ filename: './genos.db', driver: sqlite3.Database });
  await db.run('UPDATE workspaces SET isolated = 1 WHERE id = "ws-test-identity"');
  console.log('Updated workspace isolated to 1');
  const ws = await db.get('SELECT * FROM workspaces WHERE id = "ws-test-identity"');
  console.log('Workspace:', ws);
  await db.close();
}

fix().catch(console.error);