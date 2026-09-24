'use strict';

const snapshots = require('../history/snapshotService');
const stability = require('../history/causalStabilityService');

function join(session, input) {
  const replicaId = String(input?.replicaId || '').trim();
  const actorId = String(input?.actorId || '').trim();
  if (!replicaId || !actorId) throw replicaError('SYNCYTIUM_REPLICA_INVALID', 'Replica requires replicaId and actorId.');
  const current = session.replicas[replicaId];
  if (current && current.status !== 'RETIRED') return { replica: current, snapshot: null, duplicate: true };
  const snapshot = snapshots.capture(session);
  const replica = {
    replicaId,
    actorId,
    lastSeenVersion: snapshot.stateVersion,
    causalFrontier: { ...snapshot.causalFrontier },
    subscriptions: normalizeSubscriptions(input.subscriptions),
    authority: input.authority || {},
    status: 'ACTIVE',
    lastSeenMs: Date.now()
  };
  session.replicas[replicaId] = replica;
  return { replica, snapshot, duplicate: false };
}

function acknowledge(session, replicaId, frontier) {
  const replica = findReplica(session, replicaId);
  const nextFrontier = stability.acknowledgeable(session, frontier);
  for (const [actor, version] of Object.entries(replica.causalFrontier)) {
    if ((nextFrontier[actor] || 0) < version) throw replicaError('SYNCYTIUM_REPLICA_FRONTIER_REGRESSION', 'Replica causal frontier cannot move backwards.');
  }
  replica.causalFrontier = nextFrontier;
  replica.lastSeenVersion = Object.values(nextFrontier).reduce((total, value) => total + value, 0);
  replica.lastSeenMs = Date.now();
  replica.status = 'ACTIVE';
  return replica;
}

function leave(session, replicaId) {
  const replica = findReplica(session, replicaId);
  replica.status = 'RETIRED';
  replica.lastSeenMs = Date.now();
  return replica;
}

function findReplica(session, replicaId) {
  const replica = session.replicas[replicaId];
  if (!replica) throw replicaError('SYNCYTIUM_REPLICA_UNKNOWN', `Unknown Syncytium replica '${replicaId}'.`);
  return replica;
}

function normalizeSubscriptions(value) {
  return Array.isArray(value) ? [...new Set(value.map(String))] : [];
}

function replicaError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { join, acknowledge, leave };
