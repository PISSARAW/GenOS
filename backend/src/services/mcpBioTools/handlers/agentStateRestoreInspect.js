'use strict';

const { getDatabase } = require('../../../db');
const { workspaceScope, loadAgentForScope } = require('../../../controllers/lineage/helpers');

const DOMAIN_NAMES = ['agent', 'workspace', 'persistedState', 'orchestrator', 'runtime'];

function configuredScope() {
  const env = process.env;
  if (!env.GENOS_MCP_ORGANIZATION_ID || !env.GENOS_MCP_PROJECT_ID || !env.GENOS_MCP_AGENT_ID) return null;
  return { agentId: env.GENOS_MCP_AGENT_ID,
    scope: workspaceScope({ tenant: { organizationId: env.GENOS_MCP_ORGANIZATION_ID,
      projectId: env.GENOS_MCP_PROJECT_ID } }) };
}

function validDomains(domains) {
  if (!domains || typeof domains !== 'object' || Array.isArray(domains)) return false;
  return DOMAIN_NAMES.every((name) => ['ready', 'not-applicable', 'blocked'].includes(domains[name]?.status));
}

function validBlockers(blockers) {
  return Array.isArray(blockers) && blockers.every((blocker) =>
    DOMAIN_NAMES.includes(blocker.domain) && /^[A-Z][A-Z0-9_]{0,127}$/.test(blocker.code));
}

function validInspection(result) {
  if (!result || typeof result.ready !== 'boolean' || !validBlockers(result.blockers) ||
      !validDomains(result.domains)) return false;
  if (result.ready !== (result.blockers.length === 0) || result.globalAtomic !== false ||
      typeof result.runtimeRestartRequired !== 'boolean') return false;
  return Buffer.byteLength(JSON.stringify(result), 'utf8') <= 256 * 1024;
}

function publicReport(report) {
  return { ready: report.ready, globalAtomic: false,
    runtimeRestartRequired: report.runtimeRestartRequired, readinessScope: 'instantaneous',
    domains: Object.fromEntries(DOMAIN_NAMES.map((name) =>
      [name, { status: report.domains[name].status }])),
    blockers: report.blockers.map((blocker) => ({ domain: blocker.domain,
      code: blocker.code, message: 'Restore preflight blocked.' })) };
}

async function handleAgentStateRestoreInspect(args) {
  const binding = configuredScope();
  if (!binding) return { configured: false, success: false, status: 'inspection_scope_unavailable',
    code: 'MCP_AGENT_INSPECT_NOT_CONFIGURED', error: 'A server-bound agent and tenant are required.' };
  if (args.agent_id !== binding.agentId) return { configured: true, success: false,
    status: 'agent_scope_denied', code: 'MCP_AGENT_ID_MISMATCH',
    error: 'Requested agent does not match the server-bound agent.' };
  const db = await getDatabase();
  const agent = await loadAgentForScope(db, binding.scope, binding.agentId);
  if (!agent) return unavailable();
  const snapshot = await db.get(`SELECT state_json FROM agent_state_snapshots
    WHERE id = ? AND agent_id = ? AND workspace_id = ?`, args.snapshot_id, agent.id, agent.workspace_id);
  if (!snapshot) return unavailable();
  const state = JSON.parse(snapshot.state_json);
  const report = await require('../../organismRestorePreflight').inspect({
    db, scope: binding.scope, agent, state });
  if (!validInspection(report)) return { configured: true, success: false,
    status: 'inspection_contract_invalid', code: 'MCP_AGENT_INSPECT_CONTRACT_INVALID',
    error: 'Restore preflight returned an invalid report.' };
  return { ...publicReport(report), configured: true, success: true,
    status: 'agent_state_restore_inspected', agentId: agent.id, snapshotId: args.snapshot_id,
    restored: false, runtimeStarted: false };
}

function unavailable() {
  return { configured: true, success: false, status: 'inspection_source_unavailable',
    code: 'MCP_AGENT_INSPECT_NOT_FOUND', error: 'Agent or snapshot is unavailable in this scope.' };
}

function handleAgentStateRestoreInspectError(error) {
  return { configured: true, success: false, status: 'inspection_failed',
    code: 'MCP_AGENT_INSPECT_FAILED', error: 'Restore preflight failed.' };
}

module.exports = { handleAgentStateRestoreInspect, handleAgentStateRestoreInspectError };
