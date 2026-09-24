'use strict';

const expertiseDirectory = require('./expertiseDirectoryService');

function requestedReferences(input) {
  return [...new Set((Array.isArray(input.referenceIds) ? input.referenceIds : [])
    .map((value) => String(value || '').trim()).filter(Boolean))];
}

function noExpert(need) {
  return { status: 'NO_FRESH_EXPERT', delivery: 'NONE', need, expert: null, knowledgeRefs: [] };
}

function routedExpert(expert, need, knowledgeRefs) {
  return {
    status: 'ROUTED', delivery: 'UNICAST', need,
    expert: { agentId: expert.agentId, domain: expert.domain, confidence: expert.score, freshness: expert.freshnessAssessment },
    knowledgeRefs
  };
}

async function routeKnowledgeNeed(input = {}) {
  const need = String(input.need || '').trim();
  const capability = String(input.capability || input.domain || '').trim();
  if (!need || !capability) return { status: 'INVALID_NEED', delivery: 'NONE', need, expert: null, knowledgeRefs: [] };
  const finder = input.findExperts || expertiseDirectory.findExperts;
  const experts = await finder({ ...input, domain: capability, capability, count: 1 });
  const expert = experts[0];
  return expert ? routedExpert(expert, need, requestedReferences(input)) : noExpert(need);
}

module.exports = { routeKnowledgeNeed };
