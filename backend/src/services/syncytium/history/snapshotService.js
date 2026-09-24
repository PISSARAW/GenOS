'use strict';

const MAX_SNAPSHOTS = 20;

function capture(session) {
  const snapshot = {
    snapshotId: `syncytium-snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId: session.sessionId,
    createdAtMs: Date.now(),
    stateVersion: session.crdt.getSnapshot().totalOps,
    schemaVersion: session.schema?.schemaVersion || null,
    causalFrontier: session.crdt.getCausalFrontier(),
    crdtState: session.crdt.serialize(),
    shared: session.crdt.getSnapshot()
  };
  session.snapshots = [...session.snapshots, snapshot].slice(-MAX_SNAPSHOTS);
  return snapshot;
}

function list(session) {
  return [...session.snapshots];
}

module.exports = { capture, list };
