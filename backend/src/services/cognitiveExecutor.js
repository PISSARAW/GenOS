const SUPPORTED_EXECUTORS = new Set(['caller_mcp', 'codex', 'local', 'solar-direct']);

function normalizeExecutor(value) {
  const executor = String(value || '').trim().toLowerCase();
  if (executor === 'hermes' || executor === 'nous' || executor === 'nous-portal') return 'solar-direct';
  if (executor === 'antigravity') return 'caller_mcp';
  return executor || 'codex';
}

function resolveExecutor(mission = {}, environment = process.env) {
  const requested = normalizeExecutor(mission.executor || mission.runtime || environment.GENOS_AGENT_EXECUTOR);
  if (!SUPPORTED_EXECUTORS.has(requested)) {
    throw Object.assign(new Error(`Unsupported cognitive executor '${requested}'.`), { code: 'UNSUPPORTED_EXECUTOR' });
  }
  return requested;
}

function assertCallerMcpConfiguration(mission = {}, environment = process.env) {
  if (resolveExecutor(mission, environment) !== 'caller_mcp') return;
  if (!String(environment.GENOS_MCP_SAMPLING_URL || '').trim()) {
    throw Object.assign(new Error('caller_mcp requires an MCP sampling channel.'), { code: 'MCP_SAMPLING_UNAVAILABLE' });
  }
}

module.exports = { SUPPORTED_EXECUTORS, normalizeExecutor, resolveExecutor, assertCallerMcpConfiguration };
