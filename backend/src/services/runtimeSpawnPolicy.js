'use strict';

const path = require('path');
const { CODEX_RUNTIME_PATH, LOCAL_RUNTIME_PATH, CALLER_MCP_RUNTIME_PATH, SOLAR_RUNTIME_PATH } = require('./agentRuntimeExecutable');

function approvedRuntimeScripts() {
  return new Map([CODEX_RUNTIME_PATH, LOCAL_RUNTIME_PATH, CALLER_MCP_RUNTIME_PATH, SOLAR_RUNTIME_PATH]
    .map((script) => [path.resolve(script), path.resolve(script)]));
}

function approvedRuntimeBinaries() {
  const root = path.resolve(__dirname, '../../..');
  const binaries = ['debug', 'release'].flatMap((profile) => ['genos', 'genos-mcp']
    .map((name) => path.resolve(root, 'target', profile, `${name}${process.platform === 'win32' ? '.exe' : ''}`)));
  return new Map(binaries.map((binary) => [binary.toLowerCase(), binary]));
}

function trustedRuntimeExecutable(executable) {
  const candidate = path.resolve(executable);
  const script = approvedRuntimeScripts().get(candidate);
  if (script) return script;
  const binary = approvedRuntimeBinaries().get(candidate.toLowerCase());
  if (binary) return binary;
  throw new Error('Runtime executable is not in the approved runtime catalog.');
}

function assertTrustedRuntimeScript(executable) {
  const candidate = path.resolve(executable);
  if (!approvedRuntimeScripts().has(candidate)) throw new Error('Runtime script is not in the approved runtime catalog.');
}

function assertTrustedRuntimeBinary(executable) {
  const candidate = path.resolve(executable);
  if (!approvedRuntimeBinaries().has(candidate.toLowerCase())) throw new Error('Runtime binary is not in the approved build directory.');
}

function isDirectFileRuntime(executable) { return path.basename(executable) === 'solar-direct-runtime-v2.cjs'; }

function directFileWriter(executable) {
  if (isDirectFileRuntime(executable)) return 'solar_direct_write_actuator';
  if (path.basename(executable) === 'local-codex-runtime.cjs') return 'local_artifact_writer';
  return null;
}

module.exports = { assertTrustedRuntimeScript, assertTrustedRuntimeBinary, trustedRuntimeExecutable, isDirectFileRuntime, directFileWriter };
