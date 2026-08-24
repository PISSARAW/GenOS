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

function configuredExecutable() {
  const configured = String(process.env.GENOS_AGENT_EXECUTOR || '').trim();
  if (configured) return configured;

  // The bundled bridge is the supported local default. Keeping this fallback
  // here makes every launch path (npm, Studio, or an API test) behave the same
  // without requiring a separately managed environment file.
  return path.resolve(__dirname, '../../bin/genos-agent-runtime.cjs');
}

function runtimeAvailability() {
  const executable = configuredExecutable();
  if (path.isAbsolute(executable) && !fsSync.existsSync(executable)) {
    return { available: false, reason: `Agent executor was not found: ${executable}` };
  }
  if (path.basename(executable) !== 'genos-agent-runtime.cjs') return { available: true };
  const codex = process.env.CODEX_EXECUTABLE || 'codex';
  const probe = spawnSync(codex, ['--version'], { stdio: 'ignore', timeout: 3000 });
  if (probe.status !== 0) return { available: false, reason: `Codex executor is unavailable: ${codex}` };
  const runtime = bundledRuntimeEnvironment();
  const missing = [runtime.GENOS_BIN, runtime.GENOS_MCP_BIN].filter((file) => !fsSync.existsSync(file));
  if (missing.length) {
    return { available: false, reason: `GenOS runtime binaries are unavailable: ${missing.join(', ')}. Build genos-cli and genos-mcp first.` };
  }
  return { available: true };
}

function resolveExecutable(executable, workspaceRoot) {
  // Keep PATH commands (for example, `node`) intact, but make local scripts
  // independent of whether the backend was launched from backend/ or the repo root.
  if (!path.isAbsolute(executable) && executable.includes(path.sep)) return path.resolve(workspaceRoot, executable);
  return executable;
}


module.exports = { bundledRuntimeEnvironment, configuredExecutable, runtimeAvailability, resolveExecutable };
