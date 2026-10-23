'use strict';

async function permissionsForTool(input) {
  const { db, agentId, toolName, args, deniedTools = [] } = input;
  const permissions = [...(input.permissions || [])];
  if (String(toolName || '').trim().toLowerCase() === 'genos_replay'
    && !deniedTools.includes('genos_replay')
    && await require('./workerContractEnforcement').ownsReplaySnapshot(db, agentId,
      args?.snapshot || args?.snapshot_id)) permissions.push('genos_replay');
  return permissions;
}

module.exports = { permissionsForTool };
