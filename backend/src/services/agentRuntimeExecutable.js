/**
 * Executable resolution for agent runtimes: bundled binaries, configured
 * executor, and availability probing.
 */
const path = require('path');
const fsSync = require('fs');
const { spawnSync } = require('child_process');

function resolveBundled(repositoryRoot, name) {
  const isWin = process.platform === 'win32';
  const candidates = [
    path.join(repositoryRoot, 'target', 'debug', name),
    path.join(repositoryRoot, 'target', 'release', name)
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
    if (isWin && fsSync.existsSync(`${candidate}.exe`)) return `${candidate}.exe`;
  }
  const fallback = candidates[0];
  return isWin ? `${fallback}.exe` : fallback;
}

function bundledRuntimeEnvironment() {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const bundledGenos = resolveBundled(repositoryRoot, 'genos');
  const bundledMcp = resolveBundled(repositoryRoot, 'genos-mcp');
  const configuredGenos = String(process.env.GENOS_BIN || '').trim();
  const configuredMcp = String(process.env.GENOS_MCP_BIN || '').trim();
  const useConfigured = (configured, bundled) => {
    if (!configured) return bundled;
    const isWin = process.platform === 'win32';
    const configuredExists = fsSync.existsSync(configured) || (isWin && fsSync.existsSync(`${configured}.exe`));
    if (configuredExists && !/program files/i.test(configured)) {
      return isWin && !configured.endsWith('.exe') && fsSync.existsSync(`${configured}.exe`)
        ? `${configured}.exe`
        : configured;
    }
    return bundled;
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

  return CODEX_RUNTIME_PATH;
}

function runtimeAvailability(executable) {
  const target = executable || configuredExecutable();
  if (isLocalRuntime(target) || target === CODEX_RUNTIME_PATH || /\.c?js$/i.test(target)) {
    const exists = fsSync.existsSync(target);
    if (exists) {
      return { available: true, reason: 'Local cognitive runtime script ready.' };
    }
  }
  if (/\.c?js$/i.test(target) && !fsSync.existsSync(target)) {
    return { available: false, reason: `Runtime script not found at ${target}` };
  }
  const command = target === CODEX_RUNTIME_PATH
    ? (process.env.CODEX_EXECUTABLE || 'codex')
    : target;
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore', timeout: 5000 });
  if (probe.error || probe.status !== 0) {
    if (fsSync.existsSync(target)) {
      return { available: true, reason: 'Local cognitive runtime script ready.' };
    }
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
