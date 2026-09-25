'use strict';

const SHARED_STORAGE_KEYS = [
  'GENOS_DB_PATH', 'GENOS_SQLITE_BUSY_TIMEOUT_MS', 'GENOS_DB_BACKUP_SKIP', 'GENOS_CAPSULE_ROOT'
];

function buildMcpServerEnvironment({ state, binaries, sourceEnv = process.env }) {
  const environment = {
    GENOS_WORKSPACE_ROOT: binaries.workspace,
    GENOS_BIN: binaries.genosBinary || '',
    GENOS_MCP_TOOL_TIMEOUT_MS: '120000',
    GENOS_ORCHESTRATOR_BRIDGE: binaries.orchestratorBridge,
    GENOS_EXECUTION_MODE: state.executionMode,
    GENOS_AGENT_ID: state.mission.agentId,
    GENOS_ORCHESTRATOR_AGENT_ID: state.orchestratorAgentId,
    GENOS_ALLOWED_COMMANDS_JSON: JSON.stringify(state.allowedCommands),
    GENOS_ALLOW_FILE_EDITS: state.allowFileEdits ? 'true' : 'false',
    GENOS_SILENT_UPDATES: state.executionPolicy.silentUpdates === true ? 'true' : 'false',
    GENOS_MCP_LEASE: state.toolLease.join(','),
    GENOS_MCP_DISABLED_TOOLS: 'genos_orchestrate'
  };
  for (const key of SHARED_STORAGE_KEYS) {
    if (key !== 'GENOS_DB_BACKUP_SKIP' && sourceEnv[key]) environment[key] = sourceEnv[key];
  }
  if (state.executionMode === 'worker') environment.GENOS_DB_BACKUP_SKIP = '1';
  else if (sourceEnv.GENOS_DB_BACKUP_SKIP) environment.GENOS_DB_BACKUP_SKIP = sourceEnv.GENOS_DB_BACKUP_SKIP;
  return environment;
}

function serializeMcpServerEnvironment(environment) {
  const entries = Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return `{${entries.join(',')}}`;
}

module.exports = { buildMcpServerEnvironment, serializeMcpServerEnvironment };
