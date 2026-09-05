/**
 * Executable resolution for agent runtimes: bundled binaries, configured
 * executor, and availability probing.
 */
const path = require('path');
const fsSync = require('fs');
const { spawnSync } = require('child_process');

function bundledRuntimeEnvironment() {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  return {
    GENOS_BIN: process.env.GENOS_BIN || path.join(repositoryRoot, 'target/debug/genos'),
    GENOS_MCP_BIN: process.env.GENOS_MCP_BIN || path.join(repositoryRoot, 'target/debug/genos-mcp'),
    GENOS_ORCHESTRATOR_BRIDGE: process.env.GENOS_ORCHESTRATOR_BRIDGE || path.join(repositoryRoot, 'backend/bin/genos-orchestrate.cjs')
  };
}

const CODEX_RUNTIME_PATH = path.resolve(__dirname, '../../bin/genos-agent-runtime.cjs');
const LOCAL_RUNTIME_PATH = path.resolve(__dirname, '../../bin/local-codex-runtime.cjs');

function isLocalRuntime(executable) {
  if (!executable) return false;
  return path.basename(executable).includes('local-codex-runtime');
}

function configuredExecutable(mission = {}) {
  const envVal = String(process.env.GENOS_AGENT_EXECUTOR || '').trim();
  const missionExecutor = String(mission.executor || mission.runtime || '').trim();
  const candidate = missionExecutor || envVal;

  if (
    candidate === 'local' ||
    candidate === 'local-codex-runtime' ||
    mission.agentType === 'Local' ||
    mission.modelTier === 'Local' ||
    mission.localRuntime === true
  ) {
    return LOCAL_RUNTIME_PATH;
  }

  if (candidate === 'codex' || candidate === 'genos-agent-runtime') {
    return CODEX_RUNTIME_PATH;
  }

  if (candidate) return candidate;

  return CODEX_RUNTIME_PATH;
}

function runtimeAvailability(executable) {
  const target = executable || configuredExecutable();
  if (isLocalRuntime(target)) {
    const exists = fsSync.existsSync(target);
    return {
      available: exists,
      reason: exists ? 'Local cognitive runtime ready.' : `Local runtime script not found at ${target}`
    };
  }
  return { available: true };
}

function resolveExecutable(executable, workspaceRoot) {
  // Keep PATH commands (for example, `node`) intact, but make local scripts
  // independent of whether the backend was launched from backend/ or the repo root.
  if (!path.isAbsolute(executable) && executable.includes(path.sep)) return path.resolve(workspaceRoot, executable);
  return executable;
}

module.exports = {
  bundledRuntimeEnvironment,
  configuredExecutable,
  runtimeAvailability,
  resolveExecutable,
  isLocalRuntime,
  CODEX_RUNTIME_PATH,
  LOCAL_RUNTIME_PATH
};
