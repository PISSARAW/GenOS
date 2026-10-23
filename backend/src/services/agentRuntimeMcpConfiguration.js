'use strict';

const path = require('node:path');

const SHARED_STORAGE_KEYS = [
  'GENOS_DB_PATH', 'GENOS_SQLITE_BUSY_TIMEOUT_MS', 'GENOS_DB_BACKUP_SKIP',
  'GENOS_DB_BOOTSTRAP_SKIP', 'GENOS_CAPSULE_ROOT'
];

function buildMcpServerEnvironment({ state, binaries, sourceEnv = process.env }) {
  const leaseExpiresAt = resolveLeaseExpiresAt(state, sourceEnv);
  const environment = {
    GENOS_WORKSPACE_ROOT: binaries.workspace,
    GENOS_BIN: binaries.genosBinary || '',
    GENOS_MCP_TOOL_TIMEOUT_MS: '120000',
    GENOS_ORCHESTRATOR_BRIDGE: binaries.orchestratorBridge,
    GENOS_EXECUTION_MODE: state.executionMode,
    GENOS_AGENT_ID: state.mission.agentId,
    GENOS_ORCHESTRATOR_AGENT_ID: state.orchestratorAgentId,
    GENOS_MISSION_ID: state.mission.missionId || '',
    GENOS_ALLOWED_COMMANDS_JSON: JSON.stringify(state.allowedCommands),
    GENOS_ALLOW_FILE_EDITS: state.allowFileEdits ? 'true' : 'false',
    GENOS_SILENT_UPDATES: state.executionPolicy.silentUpdates === true ? 'true' : 'false',
    GENOS_MCP_LEASE: state.toolLease.join(','),
    ...(leaseExpiresAt !== null ? { GENOS_MCP_LEASE_EXPIRES_AT: String(leaseExpiresAt) } : {}),
    GENOS_MCP_DISABLED_TOOLS: 'genos_orchestrate'
  };
  for (const key of SHARED_STORAGE_KEYS) {
    if (!['GENOS_DB_BACKUP_SKIP', 'GENOS_DB_BOOTSTRAP_SKIP'].includes(key) && sourceEnv[key]) environment[key] = sourceEnv[key];
  }
  applyWorkerDatabasePolicy(environment, state, binaries, sourceEnv);
  return environment;
}

function resolveLeaseExpiresAt(state, sourceEnv = {}) {
  const startedAt = Number(state.mission.runtimeStartedAt) || Date.now();
  const deadlines = [state.mission.timeoutMs, state.executionBudget?.latencyMs]
    .map(Number).filter((value) => Number.isFinite(value) && value > 0)
    .map((duration) => startedAt + duration);
  if (sourceEnv.GENOS_MCP_LEASE_EXPIRES_AT !== undefined) {
    const hostDeadline = Number(sourceEnv.GENOS_MCP_LEASE_EXPIRES_AT);
    if (!Number.isFinite(hostDeadline)) return 0;
    deadlines.push(hostDeadline);
  }
  return deadlines.length ? Math.min(...deadlines) : null;
}

function applyWorkerDatabasePolicy(environment, state, binaries, sourceEnv) {
  const agentId = String(state?.mission?.agentId || '').trim();
  const orchestratorId = String(state?.orchestratorAgentId || '').trim();
  const workspaceRoot = String(binaries?.workspace || '').trim();
  const capsuleRoot = String(sourceEnv?.GENOS_CAPSULE_ROOT || '').trim();
  const isCapsuleWorker = isWithin(capsuleRoot, workspaceRoot);
  const isWorker = state?.executionMode === 'worker'
    || Boolean(agentId && orchestratorId && agentId !== orchestratorId) || isCapsuleWorker;
  for (const key of ['GENOS_DB_BACKUP_SKIP', 'GENOS_DB_BOOTSTRAP_SKIP']) {
    if (isWorker) environment[key] = '1';
    else if (sourceEnv[key]) environment[key] = sourceEnv[key];
  }
}

function isWithin(parent, target) {
  if (!parent || !target || !path.isAbsolute(parent) || !path.isAbsolute(target)) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return Boolean(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function serializeMcpServerEnvironment(environment) {
  const entries = Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return `{${entries.join(',')}}`;
}

module.exports = { buildMcpServerEnvironment, serializeMcpServerEnvironment, resolveLeaseExpiresAt };
