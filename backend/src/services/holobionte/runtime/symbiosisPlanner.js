'use strict';

const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const partnerChoice = require('../selection/partnerChoiceService');

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
  return { candidates, ranked };
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
