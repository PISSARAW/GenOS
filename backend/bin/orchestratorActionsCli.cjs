const path = require('path');

const TERMINAL_STATUSES = new Set(['blocked', 'error', 'terminated', 'apoptosis', 'completed', 'unverified', 'failed', 'quarantined']);

async function waitForCompletion(db, agentId, timeoutMs) {
  const deadline = Date.now() + Number(timeoutMs || 14 * 60 * 1000);
  while (Date.now() < deadline) {
    const agents = await db.all('SELECT id, status FROM agents WHERE id = ? OR parent_agent_id = ?', agentId, agentId);
    if (agents.length && agents.every((agent) => TERMINAL_STATUSES.has(agent.status))) return agents;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('GenOS orchestrator timed out');
}

async function run({ handleAction }) {
  const cliHelp = require('./cliHelp.cjs');
  if (cliHelp.checkHelp(process.argv, 'orchestratorActions.cjs')) process.exit(0);
  const { getDatabase, closeDatabase } = require('../src/db');
  let request = {};
  try { request = JSON.parse(process.argv[2] || '{}'); } catch (_) {}
  const agentId = request.id || request.workerId;
  const db = await getDatabase();
  try {
    await handleAction({
      db, action: request.action, request, task: request.task || request.mission || '',
      orchestratorId: request.orchestratorId || 'standalone_orchestrator',
      id: agentId, repoRoot: path.resolve(__dirname, '../..'),
      bridgePath: path.resolve(__dirname, 'genos-orchestrate.cjs'),
      waitForCompletion: (queryDb) => waitForCompletion(queryDb, agentId, request.timeoutMs)
    });
  } finally { await closeDatabase(); }
}

module.exports = { run, waitForCompletion, TERMINAL_STATUSES };
