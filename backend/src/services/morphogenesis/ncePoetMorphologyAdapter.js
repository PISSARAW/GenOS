'use strict';

function normalizeEnvironment(input = {}) {
  if (!input.environmentId || !input.missionProfile) throw new Error('NCE/POET environment and mission profile are required');
  return { environmentId: input.environmentId, missionProfile: input.missionProfile, constraints: input.constraints || [], provenance: input.provenance || null };
}

async function proposeOrganization(input = {}) {
  const environment = normalizeEnvironment(input);
  if (!input.proposeMorphology || typeof input.proposeMorphology !== 'function') throw new Error('morphology proposal adapter is required');
  const proposal = await input.proposeMorphology(environment);
  return { environment, proposal, retained: false, survivalEvidence: null };
}

function retainSuccessfulOrganization(candidate, evidence) {
  if (!candidate || !candidate.proposal || !evidence || evidence.verified !== true) return { retained: false, reason: 'verified survival or performance evidence is required' };
  return { retained: true, environmentId: candidate.environment.environmentId, morphology: candidate.proposal, evidence };
}

module.exports = { normalizeEnvironment, proposeOrganization, retainSuccessfulOrganization };
