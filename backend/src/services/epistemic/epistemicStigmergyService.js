'use strict';

/**
 * Stigmergie épistémique.
 *
 * Les agents ne conversent pas ; ils déposent des marqueurs structurés
 * dans un environnement épistémique partagé. Les autres agents détectent
 * les traces pertinentes selon leur niche.
 *
 * Réduit : tokens, contamination, conversation loops.
 * Augmente : coordination implicite, auditabilité.
 */

const PHEROMONE_TYPES = Object.freeze([
  'CLAIM_CONTRADICTION',
  'EVIDENCE_FAILURE',
  'ASSUMPTION_UNEXPLORED',
  'VERIFIER_SUCCESS',
  'VERIFIER_FAILURE',
  'DOMAIN_GAP',
]);

function pheromoneId() {
  return `phe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function createPheromone(type, payload = {}, opts = {}) {
  return {
    id: opts.id || pheromoneId(),
    type,
    payload,
    locus: opts.locus || null,
    intensity: opts.intensity || 0.5,
    producer: opts.producer || 'unknown',
    createdAt: new Date().toISOString(),
    ttl: opts.ttl || 3600000,
  };
}

function pheromoneEnv() {
  return {
    pheromones: [],
    subscribers: new Map(),
  };
}

function deposit(env, pheromone) {
  env.pheromones.push(pheromone);
  return pheromone;
}

function subscribe(env, niche, handler) {
  if (!env.subscribers.has(niche)) {
    env.subscribers.set(niche, []);
  }
  env.subscribers.get(niche).push(handler);
  return () => {
    const handlers = env.subscribers.get(niche) || [];
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

function detectRelevant(env, niche, locus = null) {
  const now = Date.now();
  return env.pheromones.filter((p) => {
    if (p.ttl && now - new Date(p.createdAt).getTime() > p.ttl) return false;
    if (locus && p.locus && p.locus !== locus) return false;
    return true;
  });
}

function broadcast(env, pheromone) {
  deposit(env, pheromone);
  const handlers = env.subscribers.get(pheromone.type) || [];
  for (const handler of handlers) {
    try { handler(pheromone); } catch (_) {}
  }
  return pheromone;
}

function stigmergicSignal(type, payload, opts = {}) {
  return createPheromone(type, payload, opts);
}

function sharedEpistemicEnvironment(opts = {}) {
  return {
    env: pheromoneEnv(),
    niche: opts.niche || 'general',
    locus: opts.locus || null,
    deposited: [],
    received: [],
  };
}

function depositSignal(shared, signal, opts = {}) {
  const pheromone = createPheromone(signal.type, signal.payload, {
    ...opts,
    locus: shared.locus,
    producer: opts.producer || shared.niche,
  });
  deposit(shared.env, pheromone);
  shared.deposited.push(pheromone);
  return pheromone;
}

function detectSignals(shared, locus = null) {
  const detected = detectRelevant(shared.env, shared.niche, locus || shared.locus);
  shared.received.push(...detected);
  return detected;
}

module.exports = {
  PHEROMONE_TYPES,
  pheromoneId,
  createPheromone,
  pheromoneEnv,
  deposit,
  subscribe,
  detectRelevant,
  broadcast,
  stigmergicSignal,
  sharedEpistemicEnvironment,
  depositSignal,
  detectSignals,
};
