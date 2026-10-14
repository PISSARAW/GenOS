'use strict';

const contracts = require('../src/services/strategyContractService');
const { resolveMissionWorkspace } = require('./missionWorkspaceScope.cjs');

const MISSION_ACTIONS = new Set([
  'dispatch_worker', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological', 'orchestrate'
]);

async function bindExistingOrchestrator(db, agent, workspace) {
  if (!workspace || agent.workspace_id === workspace.id) return agent.workspace_id || workspace?.id || null;
  if (agent.workspace_id) {
    throw Object.assign(new Error(`Orchestrator '${agent.id}' is already bound to another workspace.`), {
      code: 'ORCHESTRATOR_WORKSPACE_MISMATCH'
    });
  }
  await db.run('UPDATE agents SET workspace_id = ? WHERE id = ? AND workspace_id IS NULL', workspace.id, agent.id);
  return workspace.id;
}

async function initializeMission({ db, action, orchestratorId, task, request = {} }) {
  if (!MISSION_ACTIONS.has(action)) return;
  const workspace = await resolveMissionWorkspace(db, request);
  await db.run(`INSERT OR IGNORE INTO agents
    (id, name, role, status, execution_mode, workspace_id, model_tier, isolation_mode, current_task)
    VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', ?, 'frontier', 'Branch', ?)`,
  orchestratorId, workspace?.id || null, task);
  const agent = await db.get('SELECT id, workspace_id FROM agents WHERE id = ?', orchestratorId);
  const workspaceId = await bindExistingOrchestrator(db, agent, workspace);
  if (!await contracts.getLatestContract(db, orchestratorId, workspaceId)) {
    await contracts.saveContract(db, {
      agentId: orchestratorId, workspaceId, problem: task, createdBy: 'mcp_' + action
    });
  }
}

module.exports = { initializeMission };
