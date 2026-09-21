'use strict';

const { computeCuriosity, rankDomains, updateDomainAfterObservation } = require('./curiosityService');

// Curiosity-driven exploration for agents: given a set of candidate domains
// (contexts, tools, sub-problems, environments), select the most promising one
// according to learning-progress-weighted intrinsic motivation.
//
// Backed by PMC8514490 (humans monitor learning progress in curiosity-driven
// exploration) and arXiv:2211.10515 (noise-robust curiosity).

function selectCuriousDomain(candidateDomains, agentContext, curiosityOptions) {
  if (!Array.isArray(candidateDomains) || !candidateDomains.length) return null;

  const weights = curiosityOptions && curiosityOptions.weights ? curiosityOptions.weights : {};
  const ranked = rankDomains(candidateDomains, agentContext || {}, weights);
  const top = ranked[0];
  if (!top || top.curiosity <= 0) return null;
  return {
    selectedDomainId: top.domainId,
    curiosityScore: Number(top.curiosity.toFixed(4)),
    ranking: ranked.slice(0, 5).map((r) => ({
      domainId: r.domainId,
      curiosityScore: Number(r.curiosity.toFixed(4)),
    })),
  };
}

function afterObservation(domainRecord, observation) {
  return updateDomainAfterObservation(domainRecord, observation);
}

module.exports = { selectCuriousDomain, afterObservation };
