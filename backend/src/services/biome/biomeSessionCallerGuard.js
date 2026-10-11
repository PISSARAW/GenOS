'use strict';

function denied(reason) {
  return Object.assign(new Error(reason), { code: 'BIOME_CALLER_DENIED' });
}

function metadata(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
}

function assertSession(record) {
  if (record.state?.biomeId !== record.id || record.state?.ecology?.missionId !== record.id) {
    throw denied('Biome session identity is not persisted consistently.');
  }
}

function assertTenant(context, workspace) {
  if (!workspace) throw denied('Biome caller has no workspace.');
  if (context.organizationId !== undefined && context.organizationId !== workspace.organization_id) {
    throw denied('Biome caller organization does not match its workspace.');
  }
  if (context.projectId !== undefined && context.projectId !== workspace.project_id) {
    throw denied('Biome caller project does not match its workspace.');
  }
}

async function linkedChild(db, record, agent) {
  const children = await db.all(`SELECT metadata_json FROM agents
    WHERE parent_agent_id = ? AND workspace_id = ? AND execution_mode = 'worker'`,
  agent.id, agent.workspace_id);
  return children.some((child) => metadata(child.metadata_json).topologySessionId === record.id);
}

async function assertMember(db, record, agent) {
  if (agent.execution_mode === 'worker') {
    if (metadata(agent.metadata_json).topologySessionId !== record.id) {
      throw denied('Biome worker is not attached to this session.');
    }
    return;
  }
  if (agent.execution_mode !== 'orchestrator' || !await linkedChild(db, record, agent)) {
    throw denied('Biome orchestrator has no worker attached to this session and workspace.');
  }
}

async function guardBiomeCall(db, record, envelope = {}) {
  const { args, context = {} } = envelope;
  const callerId = context.agentId || process.env.GENOS_AGENT_ID;
  if (!callerId) throw denied('Biome session operation requires an authenticated agent.');
  assertSession(record);
  const agent = await db.get(`SELECT id, workspace_id, execution_mode, metadata_json
    FROM agents WHERE id = ?`, callerId);
  if (!agent?.workspace_id) throw denied('Unknown or unscoped Biome caller.');
  const workspace = await db.get(`SELECT id, organization_id, project_id FROM workspaces
    WHERE id = ?`, agent.workspace_id);
  assertTenant(context, workspace);
  await assertMember(db, record, agent);
  return args;
}

module.exports = { guardBiomeCall };
