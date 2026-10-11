'use strict';

const path = require('path');
const { getDatabase } = require('../../../db');
const { forkFromSealedSnapshot } = require('../../sealedAgentForkService');

function configuredScope() {
  const env = process.env;
  if (env.GENOS_MCP_ALLOW_AGENT_FORK !== 'true' ||
      !env.GENOS_MCP_ORGANIZATION_ID || !env.GENOS_MCP_PROJECT_ID ||
      !env.GENOS_MCP_AGENT_ID || !env.GENOS_MCP_FORK_ROOT ||
      !path.isAbsolute(env.GENOS_MCP_FORK_ROOT)) {
    return null;
  }
  return { tenant: { organizationId: env.GENOS_MCP_ORGANIZATION_ID,
    projectId: env.GENOS_MCP_PROJECT_ID }, agentId: env.GENOS_MCP_AGENT_ID,
  forkRoot: env.GENOS_MCP_FORK_ROOT };
}

async function handleAgentForkSnapshot(args) {
  const scope = configuredScope();
  if (!scope) return { configured: false, success: false, status: 'fork_not_configured',
    code: 'MCP_AGENT_FORK_NOT_CONFIGURED', error: 'A server-bound agent, tenant, and absolute fork root are required.' };
  if (args.agent_id !== scope.agentId) {
    return { configured: true, success: false, status: 'agent_scope_denied',
      code: 'MCP_AGENT_ID_MISMATCH', error: 'Requested agent does not match the server-bound agent.' };
  }
  const db = await getDatabase();
  return forkFromSealedSnapshot({ db, tenant: scope.tenant, agentId: scope.agentId,
    snapshotId: args.snapshot_id, idempotencyKey: args.idempotency_key,
    budget: args.budget, forkRoot: scope.forkRoot });
}

function handleAgentForkSnapshotError(error) {
  const code = typeof error.code === 'string' && error.code.startsWith('FORK_')
    ? error.code : 'FORK_FAILED';
  return { configured: true, success: false, status: 'fork_refused',
    code, error: code === 'FORK_FAILED' ? 'Fork operation failed.' : error.message };
}

module.exports = { handleAgentForkSnapshot, handleAgentForkSnapshotError };
