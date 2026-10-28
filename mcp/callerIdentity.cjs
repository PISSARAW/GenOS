'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

function identityId(workspaceId, parentAgentId) {
  const scope = `${workspaceId}\0${parentAgentId || 'root'}`;
  const digest = crypto.createHash('sha256').update(scope).digest('hex').slice(0, 32);
  return `codex_${digest}`;
}

function metadataForIdentity(workspaceId, parentAgentId) {
  return JSON.stringify({ managedIdentity: {
    integration: 'codex-mcp', version: 1, workspaceId, parentAgentId: parentAgentId || null
  } });
}

function readManagedIdentity(row) {
  try { return JSON.parse(row.metadata_json || '{}').managedIdentity || null; }
  catch { return null; }
}

function matchesManagedIdentity(row, expected) {
  const actual = readManagedIdentity(row);
  return actual?.integration === 'codex-mcp' && actual.version === 1
    && actual.workspaceId === expected.workspaceId
    && (actual.parentAgentId || null) === (expected.parentAgentId || null);
}

async function resolveParent(db, parentAgentId) {
  if (!parentAgentId) return null;
  const parent = await db.get(
    "SELECT id, workspace_id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'",
    parentAgentId
  );
  if (!parent?.workspace_id) throw new Error('GENOS_ORCHESTRATOR_AGENT_ID must identify a registered workspace orchestrator.');
  return parent;
}

async function resolveWorkspace(db, workspaceRoot) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const workspace = await db.get('SELECT id FROM workspaces WHERE path = ? ORDER BY created_at LIMIT 1', root);
  if (!workspace?.id) throw new Error(`No GenOS workspace is registered for '${root}'.`);
  return { id: workspace.id, root };
}

async function validateConfiguredIdentity(db, env) {
  const row = await db.get('SELECT id, execution_mode, parent_agent_id, workspace_id FROM agents WHERE id = ?', env.GENOS_AGENT_ID);
  if (!row) throw new Error('GENOS_AGENT_ID is not registered in the GenOS agents table.');
  await validateConfiguredParent(db, row);
  if (env.GENOS_ORCHESTRATOR_AGENT_ID && row.parent_agent_id !== env.GENOS_ORCHESTRATOR_AGENT_ID
    && row.id !== env.GENOS_ORCHESTRATOR_AGENT_ID) {
    throw new Error('GENOS_AGENT_ID is not a member of GENOS_ORCHESTRATOR_AGENT_ID.');
  }
  return { agentId: row.id, orchestratorId: row.execution_mode === 'orchestrator' ? row.id : row.parent_agent_id };
}

async function validateConfiguredParent(db, row) {
  if (row.execution_mode !== 'worker') return;
  if (!row.parent_agent_id) throw new Error('GENOS_AGENT_ID is a worker without an owning orchestrator.');
  const parent = await db.get(
    "SELECT id, workspace_id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", row.parent_agent_id
  );
  if (!parent) throw new Error('GENOS_AGENT_ID parent is not a registered orchestrator.');
  if (parent.workspace_id && parent.workspace_id !== row.workspace_id) {
    throw new Error('GENOS_AGENT_ID and its orchestrator must share a workspace.');
  }
}

async function createManagedIdentity(db, options) {
  const { env, workspaceRoot } = options;
  requireWorkerParent(env);
  const parent = await resolveParent(db, env.GENOS_ORCHESTRATOR_AGENT_ID);
  const workspace = await resolveIdentityWorkspace(db, parent, workspaceRoot);
  const agentId = identityId(workspace.id, parent?.id);
  const expected = { workspaceId: workspace.id, parentAgentId: parent?.id || null };
  await persistManagedIdentity(db, { agentId, parent, workspace, expected });
  return { agentId, orchestratorId: parent?.id || agentId };
}

function requireWorkerParent(env) {
  if (env.GENOS_EXECUTION_MODE === 'worker' && !env.GENOS_ORCHESTRATOR_AGENT_ID) {
    throw new Error('A worker MCP process requires its trusted GENOS_ORCHESTRATOR_AGENT_ID.');
  }
}

async function resolveIdentityWorkspace(db, parent, workspaceRoot) {
  if (!parent) return resolveWorkspace(db, workspaceRoot);
  return { id: parent.workspace_id, root: path.resolve(workspaceRoot || process.cwd()) };
}

async function persistManagedIdentity(db, identity) {
  const { agentId, parent, workspace, expected } = identity;
  const metadata = metadataForIdentity(expected.workspaceId, expected.parentAgentId);
  const mode = parent ? 'worker' : 'orchestrator';
  const role = parent ? 'development' : 'orchestrator';
  const name = parent ? 'Codex MCP Caller' : 'Codex Workspace Orchestrator';
  await db.run(`INSERT OR IGNORE INTO agents
    (id, name, role, status, execution_mode, workspace_id, parent_agent_id, lineage_relation, about, metadata_json)
    VALUES (?, ?, ?, 'idle', ?, ?, ?, 'codex_mcp', 'Managed Codex MCP identity scoped to its GenOS workspace.', ?)` ,
  agentId, name, role, mode, workspace.id, parent?.id || null, metadata);
  const row = await db.get(
    'SELECT id, execution_mode, parent_agent_id, workspace_id, metadata_json FROM agents WHERE id = ?', agentId
  );
  assertManagedIdentity(row, { mode, parent, workspace, expected });
}

function assertManagedIdentity(row, identity) {
  if (row?.execution_mode === identity.mode && row.parent_agent_id === (identity.parent?.id || null)
    && row.workspace_id === identity.workspace.id && matchesManagedIdentity(row, identity.expected)) return;
  throw new Error('The deterministic Codex MCP identity collides with an unrelated GenOS agent.');
}

async function ensureCallerIdentity(db, options = {}) {
  const { env = process.env, workspaceRoot } = options;
  const identity = env.GENOS_AGENT_ID
    ? await validateConfiguredIdentity(db, env)
    : await provisionWhenEnabled(db, { env, workspaceRoot });
  env.GENOS_AGENT_ID = identity.agentId;
  if (identity.orchestratorId) env.GENOS_ORCHESTRATOR_AGENT_ID = identity.orchestratorId;
  return identity;
}

async function provisionWhenEnabled(db, options) {
  if (options.env.GENOS_CODEX_AUTO_PROVISION_IDENTITY !== '1') {
    throw new Error('GENOS_AGENT_ID is required; enable trusted Codex identity provisioning or configure a registered caller.');
  }
  return createManagedIdentity(db, options);
}

module.exports = { ensureCallerIdentity, identityId };
