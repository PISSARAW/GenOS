const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function apoptosis(customDbPath = null) {
  let db;
  try {
    const dbPath = customDbPath || process.env.GENOS_DB_PATH || path.resolve(__dirname, '../genos.db');
    if (!fs.existsSync(dbPath)) {
      console.warn(`[Apoptose] Fichier base de données introuvable à l'emplacement : ${dbPath}`);
      return { success: false, stoppedAgents: 0, reason: 'DB_NOT_FOUND', dbPath };
    }

    db = await open({ filename: dbPath, driver: sqlite3.Database });
    const res = await db.run(
      "UPDATE agents SET status = 'apoptosis', current_task = 'Emergency apoptosis triggered', updated_at = CURRENT_TIMESTAMP WHERE status IN ('idle', 'running', 'active', 'paused', 'queued')"
    );
    const stopped = res.changes || 0;

    // Inscription télémétrique de l'apoptose si la table est présente
    await db.run(
      `INSERT INTO telemetry_events (agent_id, event_type, action, detail, severity)
       VALUES ('system', 'EMERGENCY_APOPTOSIS', 'APOPTOSIS_KILL_SWITCH', ?, 'critical')`,
      `Arrêt d'urgence exécuté : ${stopped} agent(s) passé(s) en apoptose.`
    ).catch(() => {});

    console.log(`[Apoptose d'Urgence] Exécutée avec succès. ${stopped} agent(s) stoppé(s).`);
    return { success: true, stoppedAgents: stopped, dbPath };
  } catch (err) {
    console.error(`[Apoptose d'Urgence] Erreur : ${err.message}`);
    if (require.main === module) process.exit(1);
    throw err;
  } finally {
    if (db) await db.close();
  }
}

if (require.main === module) {
  apoptosis()
    .then((result) => {
      if (!result.success) process.exitCode = 1;
    })
    .catch(() => { process.exitCode = 1; });
}

module.exports = { apoptosis };