'use strict';

const MEMBER_ROLES = Object.freeze(['generator', 'reviewer', 'verifier']);

function normalizeCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : []).filter(isUsableCandidate).map(normalizeCandidate);
}

function isUsableCandidate(candidate) {
  return candidate && typeof candidate === 'object'
    && typeof (candidate.memberId || candidate.id) === 'string'
    && MEMBER_ROLES.includes(String(candidate.communityRole || candidate.role || '').toLowerCase());
}

function normalizeCandidate(candidate) {
  return {
    ...candidate,
    memberId: candidate.memberId || candidate.id,
    role: String(candidate.communityRole || candidate.role).toLowerCase(),
    provider: candidate.provider || candidate.modelProvider || null,
    model: candidate.model || null,
    tools: stringList(candidate.tools),
    strategy: stringList(candidate.strategy),
    expertise: stringList(candidate.expertise),
    retrievalSources: stringList(candidate.retrievalSources),
    errorVector: numericVector(candidate.errorVector)
  };
}

function stringList(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function numericVector(value) {
  return Array.isArray(value) && value.every((item) => Number.isFinite(Number(item)))
    ? value.map(Number) : null;
}

module.exports = { MEMBER_ROLES, normalizeCandidates };
