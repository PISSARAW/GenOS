'use strict';

function createMaterializationController(syncytium) {
  return {
    materialize: (sessionId, options) => materialize(sessionId, options, syncytium),
    compact: (sessionId, options) => syncytium.compactHistory(sessionId, options || {})
  };
}

async function materialize(sessionId, options = {}, syncytium) {
  const stored = await syncytium.createSnapshot(sessionId, options);
  const snapshot = await syncytium.snapshot(sessionId, options);
  return { stored, snapshot, stateVersion: snapshot.shared.totalOps };
}

module.exports = { createMaterializationController };
