'use strict';

const strategyContracts = require('../strategyContractService.js');
const { createOrchestratorId } = require('./workerLauncher.cjs');

async function ensureParent({ db, context }) {
  let parent = await db.get(
    "SELECT a.id, a.status, a.is_apoptotic, a.workspace_id, a.model_tier, a.isolation_mode, w.organization_id, w.project_id, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'",
    context.orchestratorId
  );
  if (isUnavailableParent(parent)) parent = await replaceParent(db, context);
  if (!parent) throw new Error(`Orchestrator '${context.orchestratorId}' was not found.`);
  if (!await strategyContracts.getLatestContract(db, context.orchestratorId)) {
    await strategyContracts.saveContract(db, { agentId: context.orchestratorId, problem: context.task, createdBy: 'mcp_' + context.action });
  }
  return parent;
}

function isUnavailableParent(parent) {
  return Boolean(parent && (parent.is_apoptotic || ['apoptosis', 'completed', 'terminated', 'error', 'failed', 'unverified', 'quarantined'].includes(parent.status)));
}

async function replaceParent(db, context) {
  context.orchestratorId = createOrchestratorId('mcp_orchestrator');
  await db.run(
    `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task) VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`,
    context.orchestratorId, context.task
  );
  return db.get(
    "SELECT a.id, a.status, a.is_apoptotic, a.workspace_id, a.model_tier, a.isolation_mode, w.organization_id, w.project_id, w.path as workspace_root FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'",
    context.orchestratorId
  );
}

module.exports = { ensureParent, isUnavailableParent, replaceParent };