'use strict';

function denied(message) {
  return Object.assign(new Error(message), { code: 'TOPOLOGY_CALLER_DENIED' });
}

function metadata(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
}

function assertTenant(context, workspace) {
  if (!workspace) throw denied('Rhizome caller has no workspace.');
  if (context.organizationId !== undefined && context.organizationId !== workspace.organization_id) {
    throw denied('Rhizome caller organization does not match its workspace.');
  }
  if (context.projectId !== undefined && context.projectId !== workspace.project_id) {
    throw denied('Rhizome caller project does not match its workspace.');
  }
}

async function assertWorker(db, record, agent) {
  if (metadata(agent.metadata_json).topologySessionId !== record.id) {
    throw denied('Rhizome worker is not attached to this session.');
  }
  const workspace = await db.get('SELECT id, organization_id, project_id FROM workspaces WHERE id = ?', agent.workspace_id);
  if (!workspace) throw denied('Rhizome worker has no scoped workspace.');
  return workspace;
}

async function assertOrchestrator(db, record, agent) {
  if (!agent.workspace_id) throw denied('Rhizome orchestrator has no workspace.');
  const children = await db.all(`SELECT metadata_json FROM agents
    WHERE parent_agent_id = ? AND workspace_id = ? AND execution_mode = 'worker'`, agent.id, agent.workspace_id);
  if (!children.some((child) => metadata(child.metadata_json).topologySessionId === record.id)) {
    throw denied('Rhizome orchestrator has no worker attached to this session and workspace.');
  }
  const workspace = await db.get('SELECT id, organization_id, project_id FROM workspaces WHERE id = ?', agent.workspace_id);
  if (!workspace) throw denied('Rhizome orchestrator has no scoped workspace.');
  return workspace;
}

async function guardRhizomeCall(db, record, context = {}) {
  if (record.state?.rhizomeId !== record.id) throw denied('Rhizome session identity is inconsistent.');
  const callerId = context.agentId || process.env.GENOS_AGENT_ID;
  if (!callerId) throw denied('Rhizome session operation requires an authenticated agent.');
  const agent = await db.get(`SELECT id, workspace_id, execution_mode, metadata_json
    FROM agents WHERE id = ?`, callerId);
  if (!agent?.workspace_id) throw denied('Unknown or unscoped Rhizome caller.');
  let workspace;
  if (agent.execution_mode === 'worker') workspace = await assertWorker(db, record, agent);
  else if (agent.execution_mode === 'orchestrator') workspace = await assertOrchestrator(db, record, agent);
  else throw denied('Rhizome caller is neither a session worker nor its orchestrator.');
  assertTenant(context, workspace);
}

module.exports = { guardRhizomeCall };
