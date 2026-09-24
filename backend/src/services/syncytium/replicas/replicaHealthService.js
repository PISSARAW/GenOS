'use strict';

const DEFAULT_STALE_MS = 30000;

function inspect(replicas, nowMs = Date.now(), staleAfterMs = DEFAULT_STALE_MS) {
  return Object.values(replicas || {}).map((replica) => healthFor(replica, nowMs, staleAfterMs));
}

function healthFor(replica, nowMs, staleAfterMs) {
  const lagMs = Math.max(0, nowMs - replica.lastSeenMs);
  const status = ['RETIRED', 'DISCONNECTED'].includes(replica.status)
    ? replica.status : lagMs > staleAfterMs ? 'LAGGING' : replica.status;
  return { replicaId: replica.replicaId, actorId: replica.actorId, status, lagMs, lastSeenVersion: replica.lastSeenVersion };
}

module.exports = { inspect, DEFAULT_STALE_MS };
