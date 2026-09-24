'use strict';

const transactiveMemory = require('../../communication/transactiveMemoryService');
const { assessFreshness } = require('./knowledgeFreshnessService');

function domainOf(input) {
  return String(input.domain || input.capability || '').trim();
}

function freshCandidate(candidate, input) {
  return { ...candidate, freshnessAssessment: assessFreshness(candidate, input.freshness || {}) };
}

async function findExperts(input = {}) {
  const domain = domainOf(input);
  if (!domain) return [];
  const candidates = await transactiveMemory.findExperts({ ...input, domain });
  const enriched = candidates.map((candidate) => freshCandidate(candidate, input));
  return enriched.filter((candidate) => input.includeStale === true || candidate.freshnessAssessment.fresh);
}

module.exports = { findExperts };
