const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const { terminatePid, processMatches } = require('../src/services/processTermination');
const { cleanupWorkspace } = require('../src/services/agentWorkspaceLifecycleService');

async function killVerifiedAgent(db, agent) {
  // Re-read the row inside the transaction and re-verify the cmdline at the
  // moment of the kill, so a recycled PID is never signalled. The executable
  // is compared exactly (strict mode: no basename fallback).
  const fresh = await db.get('SELECT id, runtime_pid, runtime_executable FROM agents WHERE id = ?', agent.id);
  if (!fresh || !fresh.runtime_pid) return { id: agent.id, terminationRequested: false, processExitObserved: true, reason: 'NO_PID' };
  if (!processMatches(fresh.runtime_pid, fresh.runtime_executable, true)) {
    return { id: fresh.id, terminationRequested: false, processExitObserved: false, reason: 'PID_EXECUTABLE_MISMATCH' };
  }
  const terminationRequested = terminatePid(fresh.runtime_pid, fresh.runtime_executable, 'SIGKILL');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const processExitObserved = !processMatches(fresh.runtime_pid, fresh.runtime_executable, true);
  return { id: fresh.id, terminationRequested, processExitObserved,
    reason: processExitObserved ? 'PROCESS_EXIT_OBSERVED' : 'PROCESS_EXIT_UNCONFIRMED' };
}

async function openDatabase(dbPath) {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.run('PRAGMA busy_timeout = 5000;').catch(() => {});
  await db.exec('BEGIN IMMEDIATE');
  return db;
}

async function getActiveAgents(db) {
  return db.all("SELECT id, runtime_pid, runtime_executable FROM agents WHERE status IN ('idle', 'running', 'active', 'paused', 'queued')");
}

async function terminateActiveAgents(db, agents) {
  const results = [];
  for (const agent of agents) results.push(await killVerifiedAgent(db, agent));
  return results;
}

async function markAgentToApoptosis(db, agent, processExitObserved) {
  const res = await db.run(
    "UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, runtime_pid = CASE WHEN ? THEN NULL ELSE runtime_pid END, runtime_started_at = CASE WHEN ? THEN NULL ELSE runtime_started_at END, runtime_executable = CASE WHEN ? THEN NULL ELSE runtime_executable END, current_task = 'Emergency apoptosis triggered', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('idle', 'running', 'active', 'paused', 'queued')",
    processExitObserved ? 1 : 0, processExitObserved ? 1 : 0, processExitObserved ? 1 : 0, agent.id
  );
  return res.changes || 0;
}

async function updateAgentsToApoptosis(db, agents, terminationResults) {
  const outcomes = new Map(terminationResults.map((result) => [result.id, result]));
  let marked = 0;
  for (const agent of agents) {
    const result = outcomes.get(agent.id) || {};
    marked += await markAgentToApoptosis(db, agent, result.processExitObserved === true);
  }
  return marked;
}

async function runCleanups(db, terminationResults) {
  const safeAgentIds = terminationResults.filter((result) => result.processExitObserved).map((result) => result.id).slice(0, 25);
  if (!safeAgentIds.length) return;
  const placeholders = safeAgentIds.map(() => '?').join(', ');
  const cleanups = await db.all(`SELECT agent_id, workspace_root FROM agent_capsule_cleanup WHERE agent_id IN (${placeholders}) LIMIT 25`, ...safeAgentIds).catch(() => []);
  if (cleanups.length > 0) {
    await Promise.race([
      Promise.allSettled(cleanups.map(async (cleanup) => {
        try {
          await cleanupWorkspace(cleanup.workspace_root, cleanup.agent_id);
          await db.run('DELETE FROM agent_capsule_cleanup WHERE agent_id = ?', cleanup.agent_id);
        } catch (_) {}
      })),
      new Promise((r) => setTimeout(r, 2000))
    ]);
  }
}

async function logApoptosisTelemetry(db, marked, exitObserved) {
  await db.run(
    `INSERT INTO telemetry_events (agent_id, event_type, action, detail, severity)
     VALUES ('system', 'EMERGENCY_APOPTOSIS', 'APOPTOSIS_KILL_SWITCH', ?, 'critical')`,
    `Coupure d'urgence : ${marked} agent(s) marqué(s) en apoptose, sortie observée pour ${exitObserved} processus.`
  ).catch(() => {});
}

async function apoptosis(customDbPath = null) {
  let db;
  try {
    const dbPath = customDbPath || process.env.GENOS_DB_PATH || path.resolve(__dirname, '../genos.db');
    if (!fs.existsSync(dbPath)) {
      console.warn(`[Apoptose] Fichier base de données introuvable à l'emplacement : ${dbPath}`);
      return { success: false, stoppedAgents: 0, reason: 'DB_NOT_FOUND', dbPath };
    }

    db = await openDatabase(dbPath);
    let terminationResults = [];
    let marked = 0;
    try {
      const activeAgents = await getActiveAgents(db);
      terminationResults = await terminateActiveAgents(db, activeAgents);
      marked = await updateAgentsToApoptosis(db, activeAgents, terminationResults);
      await db.exec('COMMIT');
    } catch (txErr) {
      await db.exec('ROLLBACK').catch(() => {});
      throw txErr;
    }
    await runCleanups(db, terminationResults);
    const exitObserved = terminationResults.filter((result) => result.processExitObserved).length;
    await logApoptosisTelemetry(db, marked, exitObserved);

    console.log(`[Apoptose d'Urgence] État appliqué. ${marked} agent(s) marqué(s), sortie observée pour ${exitObserved} processus.`);
    return { success: true, stoppedAgents: exitObserved, markedAgents: marked, terminationResults, dbPath };
  } catch (err) {
    console.error(`[Apoptose d'Urgence] Erreur : ${err.message}`);
    if (require.main === module) process.exit(1);
    throw err;
  } finally {
    if (db) await db.close();
  }
}

const cliHelp = require('./cliHelp.cjs');
if (require.main === module) {
  if (cliHelp.checkHelp(process.argv, 'genos-apoptosis.cjs')) process.exit(0);
  apoptosis()
    .then((result) => {
      if (!result.success) process.exitCode = 1;
    })
    .catch(() => { process.exitCode = 1; });
}

module.exports = { apoptosis };
