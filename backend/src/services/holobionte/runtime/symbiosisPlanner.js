'use strict';

const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const partnerChoice = require('../selection/partnerChoiceService');
const relationResolver = require('../../morphogenesis/relationResolverService');

async function residentForCapability(db, session, capability) {
  for (const resident of session.residentSymbionts) {
    if (resident.status !== 'RESIDENT' || !(resident.capabilities || []).includes(capability)) continue;
    const contract = await contracts.getContract(db, session.holobiontId, resident.id);
    if (contract?.status === 'ACTIVE' && contract.capabilitiesOffered.includes(capability)) return { resident, contract };
  }
  return null;
}

function candidatePlan(input, session, capability) {
  const candidates = [...session.candidateSymbionts, ...(input.externalCandidates || [])];
  if (!candidates.length || !session.constitution) return { candidates: [], ranked: [] };
  const ranked = partnerChoice.rankCandidates({
    constitution: session.constitution, gap: { requiredCapabilities: [capability] }, candidates
  });
  const eligibleIds = new Set(ranked.filter((item) => item.eligible).map((item) => item.symbiontId));
  const relationType = input.relationType || 'partner';
  const relationCandidates = candidates.filter((candidate) => eligibleIds.has(String(candidate.id || '')))
    .map((candidate) => ({ ...candidate, agentId: String(candidate.id), relationType: candidate.relationType || relationType }));
  const relationChoice = relationResolver.selectPartner({ relationType, candidates: relationCandidates });
  return { candidates, ranked, relationChoice };
}

async function planCapability(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  const capability = String(input.capability || '').trim();
  if (!capability) throw Object.assign(new Error('Requested capability is required.'), { code: 'HOLOBIONT_CAPABILITY_REQUIRED' });
  const resident = await residentForCapability(db, session, capability);
  if (resident) return { status: 'READY', session, capability, ...resident };
  const acquisition = candidatePlan(input, session, capability);
  return { status: 'CAPABILITY_GAP', session, capability, ...acquisition };
}

module.exports = { planCapability };
