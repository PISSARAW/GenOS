'use strict';

const vectors = require('../causality/versionVectorService');

function stableFrontier(session) {
  const current = session.crdt.getCausalFrontier();
  const active = Object.values(session.replicas || {}).filter((replica) => ['ACTIVE', 'LAGGING', 'REJOINING', 'PARTITIONED'].includes(replica.status));
  if (!active.length) return current;
  const actors = new Set(Object.keys(current));
  for (const replica of active) Object.keys(replica.causalFrontier || {}).forEach((actor) => actors.add(actor));
  return Object.fromEntries([...actors].map((actor) => [actor, minimumVersion(actor, current, active)]));
}

function minimumVersion(actor, current, replicas) {
  return Math.min(current[actor] || 0, ...replicas.map((replica) => replica.causalFrontier?.[actor] || 0));
}

function acknowledgeable(session, frontier) {
  const current = session.crdt.getCausalFrontier();
  const entries = Object.entries(frontier || {});
  for (const [actor, version] of entries) {
    if (!Number.isSafeInteger(version) || version < 0 || version > (current[actor] || 0)) {
      throw Object.assign(new Error(`Replica acknowledgement exceeds the known causal frontier for '${actor}'.`), { code: 'SYNCYTIUM_REPLICA_FRONTIER_INVALID' });
    }
  }
  return vectors.merge({}, Object.fromEntries(entries));
}

module.exports = { stableFrontier, acknowledgeable };
