const path = require('path');
const runtime = require('./agentRuntimeExecutable');

function isCodexRuntime(executable) {
  return path.resolve(executable || '') === runtime.CODEX_RUNTIME_PATH;
}

async function assertResumeRequest(db, input) {
  if (!input.checkpointId) return null;
  if (typeof input.checkpointId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(input.checkpointId)) {
    throw Object.assign(new Error('Runtime checkpoint identifier is invalid.'),
      { code: 'RUNTIME_CHECKPOINT_INVALID', status: 409 });
  }
  if (runtime.isLocalRuntime(input.executable)) {
    return require('./localRuntimeCheckpoint').assertResumeRequest(db,
      { ...input, localRuntime: true });
  }
  if (isCodexRuntime(input.executable)) {
    return require('./codexRuntimeCheckpoint').assertResumeRequest(db,
      { ...input, codexRuntime: true });
  }
  throw Object.assign(new Error('Runtime checkpoint adapter is unavailable.'),
    { code: 'RUNTIME_CHECKPOINT_ADAPTER_REQUIRED', status: 409 });
}

module.exports = { isCodexRuntime, assertResumeRequest };
