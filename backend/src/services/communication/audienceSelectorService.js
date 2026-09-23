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

const MAX_VARIANTS = 8;

function profileKey(unknownRefs, refs) {
  return refs.map((ref) => (unknownRefs.indexOf(ref) >= 0 ? '1' : '0')).join('');
}

async function rolesOf(db, ids) {
  const roles = new Map();
  if (ids.length === 0) return roles;
  const marks = ids.map(() => '?').join(',');
  const rows = await db.all(`SELECT id, role FROM agents WHERE id IN (${marks})`, ids);
  for (const row of rows) {
    roles.set(row.id, row.role || 'unknown');
  }
  return roles;
}

function variantKey(candidate, refs, roles) {
  const role = roles.get(candidate.agentId) || 'unknown';
  return `${role}|${profileKey(candidate.unknownRefs, refs)}`;
}

function groupByVariant(enriched, refs, roles) {
  const groups = new Map();
  for (const candidate of enriched) {
    const key = variantKey(candidate, refs, roles);
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(candidate.agentId);
    } else {
      const role = roles.get(candidate.agentId) || 'unknown';
      groups.set(key, { profile: key, role, members: [candidate.agentId], unknownRefs: candidate.unknownRefs });
    }
  }
  return [...groups.values()];
}

function mergeGroups(tail) {
  const members = [];
  const refs = new Set();
  for (const group of tail) {
    for (const member of group.members) members.push(member);
    for (const ref of group.unknownRefs) refs.add(ref);
  }
  return { profile: 'merged', role: 'mixed', members, unknownRefs: [...refs] };
}

function capVariants(groups) {
  if (groups.length <= MAX_VARIANTS) return groups;
  const ranked = [...groups].sort((a, b) => b.members.length - a.members.length);
  const head = ranked.slice(0, MAX_VARIANTS - 1);
  head.push(mergeGroups(ranked.slice(MAX_VARIANTS - 1)));
  return head;
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
  const ids = informed.map((candidate) => candidate.agentId);
  const roles = await rolesOf(input.db, ids);
  const groups = capVariants(groupByVariant(informed, refs, roles));
  return {
    candidates: informed, groups,
    recipientIds: ids, suggestedScope: suggestedScopeOf(ids.length)
  };
}

module.exports = { MAX_VARIANTS, selectAudience, capVariants };
