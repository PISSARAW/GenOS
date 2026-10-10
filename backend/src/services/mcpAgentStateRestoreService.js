'use strict';

const { getDatabase } = require('../db');
const { workspaceScope, loadAgentForScope } = require('../controllers/lineage/helpers');

function trustedScope() {
  if (process.env.GENOS_MCP_ALLOW_AGENT_RESTORE !== 'true') {
    throw new Error('Agent state restore requires GENOS_MCP_ALLOW_AGENT_RESTORE=true.');
  }
  const organizationId = process.env.GENOS_MCP_ORGANIZATION_ID;
  const projectId = process.env.GENOS_MCP_PROJECT_ID;
  if (!organizationId || !projectId) {
    throw new Error('Agent state restore requires a trusted MCP organization and project scope.');
  }
  return workspaceScope({ tenant: { organizationId, projectId } });
}

function validateRequest(input) {
  if (typeof input.agent_id !== 'string' || !input.agent_id.trim() || input.agent_id.length > 128) {
    throw new Error('agent_id is required.');
  }
  if (typeof input.baseline_snapshot_id !== 'string' || !input.baseline_snapshot_id.trim()
    || input.baseline_snapshot_id.length > 256) {
    throw new Error('baseline_snapshot_id is required.');
  }
  if (input.future_memories !== undefined && (!Array.isArray(input.future_memories)
    || input.future_memories.length > 0)) {
    throw new Error('Future memory injection is unsupported; restore a sealed snapshot only.');
  }
}

async function restoreAgentSnapshot(input) {
  validateRequest(input);
  const scope = trustedScope();
  const db = await getDatabase();
  const agent = await loadAgentForScope(db, scope, input.agent_id);
  if (!agent) throw new Error('Agent is not available in the trusted MCP scope.');
  const snapshot = await db.get(
    'SELECT state_json FROM agent_state_snapshots WHERE id = ? AND agent_id = ?',
    input.baseline_snapshot_id, agent.id
  );
  if (!snapshot) throw new Error('Agent snapshot is not available in the trusted MCP scope.');
  const state = JSON.parse(snapshot.state_json);
  if (!state?._genosSnapshot?.organismSnapshot?.hash) {
    throw new Error('Agent snapshot has no sealed organism manifest.');
  }
  const { restoreAgentStateSnapshot } = require('../controllers/lineage/snapshots');
  const restored = await restoreAgentStateSnapshot({ db, scope, agent, state });
  return {
    configured: true, success: true, status: 'agent_state_restored',
    agent_id: agent.id, snapshot_id: input.baseline_snapshot_id,
    consciousnessTransferred: false, futureMemoriesInjected: 0,
    ...restored,
  };
}

module.exports = { restoreAgentSnapshot };
