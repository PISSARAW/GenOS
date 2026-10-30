'use strict';

const { execFileSync } = require('node:child_process');
const { executeLeanCheck } = require('../../src/services/epistemicScheduler/leanProcessExecutor');

async function leanTestConfiguration() {
  const leanExecutable = process.env.GENOS_LEAN_EXECUTABLE || 'lean';
  const toolchainVersion = execFileSync(leanExecutable, ['--version'], {
    encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
  const execution = await executeLeanCheck({ leanExecutable, toolchainVersion,
    source: 'theorem genos_environment_probe : 0 = 0 := by rfl', timeoutMs: 90000 });
  if (execution.exitCode !== 0 || execution.axioms?.length !== 0) {
    throw new Error(`Real Lean environment measurement failed: ${execution.reason} ${execution.stderr}`);
  }
  return { leanExecutable, toolchainVersion, environmentDigest: execution.environmentDigest, timeoutMs: 90000 };
}

module.exports = { leanTestConfiguration };
