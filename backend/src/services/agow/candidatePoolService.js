'use strict';

const { validCandidate } = require('./candidateValidationService');

const DEFAULT_TTL_MS = 60000;
const pools = new Map();

function poolFor(agentId) {
  if (!pools.has(agentId)) pools.set(agentId, new Map());
  return pools.get(agentId);
}

function conflictWith(candidate, existing) {
  const left = candidate.content?.artifactRef;
  const right = existing.content?.artifactRef;
  return Boolean(left && left === right && candidate.content.semanticType !== existing.content.semanticType);
}

function prune(pool, now) {
  for (const [id, candidate] of pool) {
    if (candidate.expiresAt <= now) pool.delete(id);
  }
}

function submit(options) {
  const candidate = options?.candidate;
  const now = Number(options?.now) || Date.now();
  if (!validCandidate(candidate)) return { accepted: false, reason: 'invalid_candidate' };
  if (candidate.producedAt > now || candidate.expiresAt <= now) return { accepted: false, reason: 'stale_candidate' };
  const pool = poolFor(candidate.agentId);
  prune(pool, now);
  const duplicate = [...pool.values()].find((item) => item.candidateId === candidate.candidateId
    || (candidate.redundancyKey && item.redundancyKey === candidate.redundancyKey));
  if (duplicate) {
    const refs = new Set([...duplicate.evidenceRefs, ...candidate.evidenceRefs]);
    duplicate.evidenceRefs = [...refs];
    duplicate.causalParents = [...new Set([...duplicate.causalParents, ...candidate.causalParents])];
    return { accepted: true, merged: true, candidate: duplicate };
  }
  const contradictions = [...pool.values()].filter((item) => conflictWith(candidate, item)).map((item) => item.candidateId);
  pool.set(candidate.candidateId, { ...candidate, evidenceRefs: [...candidate.evidenceRefs], causalParents: [...candidate.causalParents], contradictions });
  return { accepted: true, merged: false, contradictions };
}

function list(options) {
  const now = Number(options?.now) || Date.now();
  const pool = poolFor(options?.agentId);
  prune(pool, now);
  return [...pool.values()].filter((candidate) => !options?.semanticType || candidate.content.semanticType === options.semanticType);
}

function remove(options) {
  return poolFor(options?.agentId).delete(options?.candidateId);
}

function clear(options) {
  if (options?.agentId) pools.delete(options.agentId);
  else pools.clear();
}

module.exports = { submit, list, remove, clear, DEFAULT_TTL_MS };
