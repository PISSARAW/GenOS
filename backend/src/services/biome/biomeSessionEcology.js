'use strict';

const { createNiche } = require('./contracts/niche');
const populationService = require('./populations/populationService');

function createInitialEcology(members) {
  return {
    populations: members.map(createSeedPopulation),
    niches: members.map(createCandidateNiche)
  };
}

function memberEcologyIds(member) {
  const role = String(member.role || 'worker');
  return {
    populationId: member.runtimeContext?.populationId || `population-${role}`,
    nicheId: member.runtimeContext?.nicheId || `niche-${role}`
  };
}

function createSeedPopulation(member) {
  const { populationId, nicheId } = memberEcologyIds(member);
  return populationService.normalizePopulation({
    populationId, nicheId, individuals: [],
    resourcePool: { compute: 0, memory: 0, storage: 0, network: 0, energy: 0, costUsd: 0 },
    productivity: 0, marginalProductivity: 0, status: 'seed'
  });
}

function createCandidateNiche(member) {
  const { nicheId } = memberEcologyIds(member);
  return createNiche({ nicheId, status: 'candidate', opportunityScore: 0.5,
    novelty: 0.5, evidenceRefs: [], resourceProfile: {} });
}

module.exports = { createInitialEcology };
