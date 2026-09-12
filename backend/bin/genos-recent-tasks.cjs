const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function getRecentTasks() {
  let db;
  try {
    const dbPath = process.env.GENOS_DB_PATH || path.resolve(__dirname, '../genos.db');
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    // Selectionner les 4 dernières missions distinctes de manière déterministe
    const tasks = await db.all(
      "SELECT current_task FROM agents WHERE current_task IS NOT NULL AND current_task != '' GROUP BY current_task ORDER BY MAX(created_at) DESC LIMIT 4"
    );
    console.log(JSON.stringify({ success: true, tasks: tasks.map(t => t.current_task) }));
  } catch (err) {
    console.error(`[Recent Tasks] Database error: ${err.message}`);
    console.log(JSON.stringify({
      success: false,
      error: { code: 'DB_UNAVAILABLE', message: err.message },
      tasks: []
    }));
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}

getRecentTasks();