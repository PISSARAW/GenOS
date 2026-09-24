'use strict';

const snapshotService = require('./snapshotService');
const garbageCollection = require('./garbageCollectionService');
const replicaRegistry = require('../replicas/replicaRegistryService');
const replicaHealth = require('../replicas/replicaHealthService');
const coordinationRouter = require('../consistency/coordinationRouter');

function createSessionHistoryService(dependencies) {
  return {
    createSnapshot: (sessionId, options) => createSnapshot(sessionId, options, dependencies),
    listSnapshots: (sessionId, options) => listSnapshots(sessionId, options, dependencies),
    compactHistory: (sessionId, options) => compactHistory(sessionId, options, dependencies),
    joinReplica: (sessionId, replica, options) => mutateReplica({ sessionId, options, dependencies, mutate: (session) => replicaRegistry.join(session, replica) }),
    acknowledgeReplica: (sessionId, replicaId, request) => mutateReplica({
      sessionId, options: request.options || {}, dependencies,
      mutate: (session) => replicaRegistry.acknowledge(session, replicaId, request.frontier)
    }),
    leaveReplica: (sessionId, replicaId, options) => mutateReplica({
      sessionId, options, dependencies, mutate: (session) => replicaRegistry.leave(session, replicaId)
    }),
    inspectReplicas: (sessionId, options) => inspectReplicas(sessionId, options, dependencies)
  };
}

async function createSnapshot(sessionId, options, dependencies) {
  return coordinationRouter.run({ coordinationRequired: true }, sessionId, async () => {
    const session = await dependencies.getSession(sessionId, options.db);
    const snapshot = snapshotService.capture(session);
    session.pendingSnapshot = snapshot;
    await persistMutation({ session, options, dependencies, rollback: () => {
      session.snapshots = session.snapshots.filter((item) => item.snapshotId !== snapshot.snapshotId);
    } });
    return snapshot;
  });
}

async function listSnapshots(sessionId, options, dependencies) {
  return snapshotService.list(await dependencies.getSession(sessionId, options.db));
}

async function compactHistory(sessionId, options, dependencies) {
  return coordinationRouter.run({ coordinationRequired: true }, sessionId, async () => {
    const session = await dependencies.getSession(sessionId, options.db);
    const previousState = session.crdt.serialize();
    const previousSnapshots = [...session.snapshots];
    const result = garbageCollection.collect(session);
    if (!result.compacted) return result;
    const snapshot = snapshotService.capture(session);
    session.pendingCompaction = { ...result, snapshotId: snapshot.snapshotId, compactedAtMs: Date.now() };
    await persistMutation({ session, options, dependencies, rollback: () => {
      session.crdt.restore(previousState);
      session.snapshots = previousSnapshots;
    } });
    return { ...result, snapshotId: snapshot.snapshotId };
  });
}

async function mutateReplica(context) {
  const { sessionId, options, dependencies, mutate } = context;
  return coordinationRouter.run({ coordinationRequired: true }, sessionId, async () => {
    const session = await dependencies.getSession(sessionId, options.db);
    const previousReplicas = structuredClone(session.replicas);
    const previousSnapshots = [...session.snapshots];
    const result = mutate(session);
    if (result.duplicate) return result;
    session.pendingReplicaEvent = { type: result.snapshot ? 'JOIN' : 'UPDATE', replicaId: result.replica?.replicaId || result.replicaId };
    await persistMutation({ session, options, dependencies, rollback: () => {
      session.replicas = previousReplicas;
      session.snapshots = previousSnapshots;
    } });
    return result;
  });
}

async function inspectReplicas(sessionId, options, dependencies) {
  const session = await dependencies.getSession(sessionId, options.db);
  return replicaHealth.inspect(session.replicas);
}

function persistMutation(context) {
  const { session, options, dependencies, rollback } = context;
  return dependencies.persist(options.db, session).catch((error) => {
    rollback();
    session.pendingSnapshot = null;
    session.pendingCompaction = null;
    session.pendingReplicaEvent = null;
    throw error;
  });
}

module.exports = { createSessionHistoryService };
