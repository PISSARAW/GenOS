'use strict';

const path = require('path');
const { CODEX_RUNTIME_PATH, LOCAL_RUNTIME_PATH, CALLER_MCP_RUNTIME_PATH, SOLAR_RUNTIME_PATH } = require('./agentRuntimeExecutable');

function assertTrustedRuntimeScript(executable) {
  const approvedScripts = [CODEX_RUNTIME_PATH, LOCAL_RUNTIME_PATH, CALLER_MCP_RUNTIME_PATH, SOLAR_RUNTIME_PATH];
  if (!approvedScripts.includes(path.resolve(executable))) throw new Error('Runtime script is not in the approved runtime catalog.');
}

function assertTrustedRuntimeBinary(executable) {
  const root = path.resolve(__dirname, '../../..');
  const relative = path.relative(root, path.resolve(executable));
  if (!/^target[\\/](debug|release)[\\/](genos|genos-mcp)(\.exe)?$/i.test(relative)) {
    throw new Error('Runtime binary is not in the approved build directory.');
  }
}

function isDirectFileRuntime(executable) { return path.basename(executable) === 'solar-direct-runtime-v2.cjs'; }

function directFileWriter(executable) {
  if (isDirectFileRuntime(executable)) return 'solar_direct_write_actuator';
  if (path.basename(executable) === 'local-codex-runtime.cjs') return 'local_artifact_writer';
  return null;
}

module.exports = { assertTrustedRuntimeScript, assertTrustedRuntimeBinary, isDirectFileRuntime, directFileWriter };
