'use strict';

const { validCandidate } = require('./candidateValidationService');

const DEFAULT_TTL_MS = 60000;
const SCOPE = 'agow_candidate_pool';

async function load(options) {
  const result = await require('./agowStatePersistenceService').load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  return { db: result.db, candidates: Array.isArray(result.state.candidates) ? result.state.candidates : [] };
}

async function persist(options) {
  await require('./agowStatePersistenceService').save({ scope: SCOPE, agentId: options.agentId, db: options.db, state: { candidates: options.candidates }, version: options.candidates.length });
}

function conflictWith(candidate, existing) {
  const left = candidate.content?.artifactRef;
  const right = existing.content?.artifactRef;
  return Boolean(left && left === right && candidate.content.semanticType !== existing.content.semanticType);
}

function prune(candidates, now) {
  return candidates.filter((candidate) => candidate.expiresAt > now);
}

function duplicateOf(candidates, candidate) {
  return candidates.find((item) => item.candidateId === candidate.candidateId
    || (candidate.redundancyKey && item.redundancyKey === candidate.redundancyKey));
}

async function submit(options) {
  const candidate = options?.candidate;
  const now = Number(options?.now) || Date.now();
  if (!validCandidate(candidate)) return { accepted: false, reason: 'invalid_candidate' };
  if (candidate.producedAt > now || candidate.expiresAt <= now) return { accepted: false, reason: 'stale_candidate' };
  const db = await require('./agowStatePersistenceService').databaseFor(options.db);
  return require('../../db').withTransaction(db, () => submitInsideTransaction({ candidate, now, db }));
}

async function submitInsideTransaction(options) {
  const { candidate, now, db } = options;
  const state = await load({ agentId: candidate.agentId, db });
  const candidates = prune(state.candidates, now);
  const duplicate = duplicateOf(candidates, candidate);
  if (duplicate) return mergeDuplicate({ duplicate, candidate, candidates, agentId: candidate.agentId, db });
  const contradictions = candidates.filter((item) => conflictWith(candidate, item)).map((item) => item.candidateId);
  candidates.push({ ...candidate, evidenceRefs: [...candidate.evidenceRefs], causalParents: [...candidate.causalParents], contradictions });
  await persist({ agentId: candidate.agentId, db, candidates });
  return { accepted: true, merged: false, contradictions };
}

async function mergeDuplicate(options) {
  const { duplicate, candidate, candidates, agentId, db } = options;
  duplicate.evidenceRefs = [...new Set([...duplicate.evidenceRefs, ...candidate.evidenceRefs])];
  duplicate.causalParents = [...new Set([...duplicate.causalParents, ...candidate.causalParents])];
  await persist({ agentId, db, candidates });
  return { accepted: true, merged: true, candidate: duplicate };
}

async function list(options) {
  const now = Number(options?.now) || Date.now();
  const state = await load({ agentId: options.agentId, db: options.db });
  const candidates = prune(state.candidates, now);
  return candidates.filter((candidate) => !options?.semanticType || candidate.content.semanticType === options.semanticType);
}

async function remove(options) {
  const db = await require('./agowStatePersistenceService').databaseFor(options.db);
  return require('../../db').withTransaction(db, async (txDb) => {
    const state = await load({ agentId: options.agentId, db: txDb });
    const candidates = state.candidates.filter((candidate) => candidate.candidateId !== options.candidateId);
    await persist({ agentId: options.agentId, db: txDb, candidates });
    return candidates.length < state.candidates.length;
  });
}

async function clear(options) {
  if (!options?.agentId) return { cleared: false, reason: 'agent_id_required' };
  await persist({ agentId: options.agentId, db: options.db, candidates: [] });
  return { cleared: true };
}

module.exports = { submit, list, remove, clear, DEFAULT_TTL_MS };
