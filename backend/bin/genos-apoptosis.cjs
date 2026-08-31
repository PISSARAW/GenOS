const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function apoptosis() {
  let db;
  try {
    const dbPath = path.resolve(__dirname, '../../backend/genos.db');
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    const res = await db.run("UPDATE agents SET status = 'killed' WHERE status IN ('idle', 'running')");
    console.log(`Apoptosis exécutée. ${res.changes || 0} agent(s) stoppé(s).`);
  } catch (err) {
    console.error(`Erreur lors de l'apoptosis: ${err.message}`);
    process.exit(1);
  } finally {
    if (db) await db.close();
  }
}

apoptosis();