const HOSTS = Object.freeze({ win32: 'windows', darwin: 'macos', linux: 'linux' });

function report() {
  const host = HOSTS[process.platform] || 'other';
  const supported = host !== 'other';
  return {
    host,
    targetHosts: ['windows', 'macos', 'linux'],
    hostRecognized: supported,
    captureMode: supported ? 'logical' : 'unavailable',
    logicalCheckpoint: {
      available: supported,
      activeLocalRuntimeAtSafePoint: supported,
      requiresStoppedRuntimeForRestore: true
    },
    processMemory: {
      captureAvailable: false,
      restoreAvailable: false,
      backend: null,
      reason: 'The supervised agent runs as a host process; no portable memory restore adapter is integrated.'
    },
    providerHiddenContext: { restoreAvailable: false },
    globalOrganismRestore: { available: false }
  };
}

function requestedMemory(body) {
  const mode = body?.snapshotMode;
  if (mode != null && mode !== 'logical' && mode !== 'process-memory') {
    throw Object.assign(new Error('snapshotMode must be logical or process-memory.'),
      { code: 'ORGANISM_SNAPSHOT_MODE_INVALID', status: 400 });
  }
  return mode === 'process-memory' || body?.processMemory === true
    || body?.restoreProcessMemory === true;
}

function assertRequest(body) {
  if (!requestedMemory(body)) return;
  throw Object.assign(new Error('Process memory capture and restore require a supervised VM backend that is not integrated.'),
    { code: 'ORGANISM_PROCESS_MEMORY_UNAVAILABLE', status: 422 });
}

module.exports = { report, assertRequest };
