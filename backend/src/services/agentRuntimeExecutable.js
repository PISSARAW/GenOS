/**
 * Executable resolution for agent runtimes: bundled binaries, configured
 * executor, and availability probing.
 */
const path = require('path');
const fsSync = require('fs');
const { spawnSync } = require('child_process');

function bundledRuntimeEnvironment() {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const bundledGenos = path.join(repositoryRoot, 'target/debug/genos');
  const bundledMcp = path.join(repositoryRoot, 'target/debug/genos-mcp');
  const configuredGenos = String(process.env.GENOS_BIN || '').trim();
  const configuredMcp = String(process.env.GENOS_MCP_BIN || '').trim();
  const useConfigured = (configured, bundled) => {
    if (!configured) return bundled;
    const bundledExists = fsSync.existsSync(bundled) || (process.platform === 'win32' && fsSync.existsSync(`${bundled}.exe`));
    if (bundledExists && /program files/i.test(configured)) return bundled;
    return configured;
  };
  return {
    GENOS_BIN: useConfigured(configuredGenos, bundledGenos),
    GENOS_MCP_BIN: useConfigured(configuredMcp, bundledMcp),
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
  if (/\.c?js$/i.test(target) && !fsSync.existsSync(target)) {
    return { available: false, reason: `Runtime script not found at ${target}` };
  }
  const command = target === CODEX_RUNTIME_PATH
    ? (process.env.CODEX_EXECUTABLE || 'codex')
    : target;
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore', timeout: 5000 });
  if (probe.error || probe.status !== 0) {
    return { available: false, reason: `Runtime executable is unavailable: ${command}` };
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
