const { spawn } = require('child_process');
function getRunnerStdio(processId) {
  const logDir = process.env.GENOS_RUNNER_LOG_DIR;
  if (!logDir) return ['pipe', 'pipe', 'pipe'];
  try {
    const fs = require('fs');
    fs.mkdirSync(logDir, { recursive: true });
    return ['pipe', 'pipe', 'pipe'];
  } catch {
    return ['pipe', 'pipe', 'pipe'];
  }
}
function launchDetached(context, runnerRequest, detachedProcessId) {
  const stdio = getRunnerStdio(detachedProcessId);
  const env = buildRunnerEnv();
  if (process.platform === 'win32') {
    const runner = spawn(process.execPath, [context.bridgePath, JSON.stringify(runnerRequest)], { cwd: context.repoRoot, detached: true, windowsHide: true, stdio: 'ignore', env });
    runner.unref();
    return runner;
  }
  const runner = spawn(process.execPath, [context.bridgePath, JSON.stringify(runnerRequest)], { cwd: context.repoRoot, detached: true, stdio, env });
  runner.unref();
  return runner;
}
function buildRunnerEnv() {
  return {
    ...process.env,
    GENOS_LOCAL_MODEL: process.env.GENOS_LOCAL_MODEL || '',
    GENOS_AGENT_EXECUTOR: process.env.GENOS_AGENT_EXECUTOR || '',
    GENOS_DEFAULT_MODEL: process.env.GENOS_DEFAULT_MODEL || '',
    GENOS_RUNNER_LOG_DIR: process.env.GENOS_RUNNER_LOG_DIR || '',
    GENOS_EXECUTION_MODE: process.env.GENOS_EXECUTION_MODE || 'orchestrator'
  };
}
module.exports = { getRunnerStdio, launchDetached, buildRunnerEnv };
