'use strict';

const { createNiche } = require('../../biome/contracts/niche');
const { upsertNiche } = require('../../biome/niches/nicheStore');
const { assessAndStore } = require('../../biome/niches/agentNicheService');
const waves = require('./experimentWaveRuntime');

function assign(ecology, wave, individuals) {
  let niches = ecology.niches || [];
  const assignments = waves.nicheAssignments(wave);
  for (const item of assignments) {
    const experiment = wave.contracts.find((value) => value.hypothesisId === item.hypothesisId);
    niches = upsertNiche(niches, createNiche({ ...item, descriptor: JSON.stringify(item.intervention),
      opportunityScore: Math.max(0, experiment.utility), carryingCapacity: 1, capacityKnown: true,
      status: 'open', evidenceRefs: item.sourceRefs,
      entryConditions: [{ hypothesisId: item.hypothesisId, verifierId: item.verifierId }] }));
  }
  ecology.niches = niches;
  return { assignments, assessment: assessAndStore(ecology, individuals), ecology };
}

module.exports = { assign };
