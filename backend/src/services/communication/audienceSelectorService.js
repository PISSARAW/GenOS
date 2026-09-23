'use strict';

const { findExperts } = require('./transactiveMemoryService');
const { computeKnowledgeDelta } = require('./commonGroundService');

function limitOf(input) {
  const asked = Number(input.maxCandidates || 8);
  if (asked < 1) return 1;
  if (asked > 50) return 50;
  return Math.floor(asked);
}

async function rankCandidates(input) {
  const fromIds = input.independenceFrom || [];
  return findExperts({
    db: input.db, domain: input.domain, capability: input.capability,
    requiredTools: input.requiredTools, count: limitOf(input),
    independenceFrom: fromIds, independenceThreshold: input.independenceThreshold,
    maxCost: input.maxCost, weights: input.weights
  });
}

async function attachUnknownRefs(query) {
  const enriched = [];
  for (const candidate of query.candidates) {
    const unknown = await computeKnowledgeDelta({
      db: query.db, senderId: query.senderId, receiverId: candidate.agentId, semanticRefs: query.refs
    });
    enriched.push({ agentId: candidate.agentId, score: candidate.score, unknownRefs: unknown });
  }
  return enriched;
}

function profileKey(unknownRefs, refs) {
  return refs.map((ref) => (unknownRefs.indexOf(ref) >= 0 ? '1' : '0')).join('');
}

function groupByProfile(enriched, refs) {
  const groups = new Map();
  for (const candidate of enriched) {
    const key = profileKey(candidate.unknownRefs, refs);
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(candidate.agentId);
    } else {
      groups.set(key, { profile: key, members: [candidate.agentId], unknownRefs: candidate.unknownRefs });
    }
  }
  return [...groups.values()];
}

function suggestedScopeOf(count) {
  if (count <= 1) return 'UNICAST';
  if (count <= 8) return 'SELECTIVE_MULTICAST';
  return 'QUORUM';
}

async function selectAudience(input) {
  const candidates = await rankCandidates(input);
  const refs = input.semanticRefs || [];
  const enriched = await attachUnknownRefs({ db: input.db, senderId: input.senderId, candidates, refs });
  const informed = enriched.filter((candidate) => candidate.unknownRefs.length > 0);
  const groups = groupByProfile(informed, refs);
  const ids = informed.map((candidate) => candidate.agentId);
  return {
    candidates: informed, groups,
    recipientIds: ids, suggestedScope: suggestedScopeOf(ids.length)
  };
}

module.exports = { selectAudience };
