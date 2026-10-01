'use strict';

const persistence = require('../agowStatePersistenceService');
const topologyAdapter = require('./marketTopologyAdapter');

const SCOPE = 'agow_market_morphology';
const FORBIDDEN_SELECTION_KEYS = new Set(['winner', 'winners', 'winnerIds', 'candidateIds', 'selectedCandidates']);

function hasContentSelection(value) {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, nested] of Object.entries(current)) {
      if (FORBIDDEN_SELECTION_KEYS.has(key)) return true;
      if (nested && typeof nested === 'object') pending.push(nested);
    }
  }
  return false;
}

function normalizeProposal(input) {
  const proposal = input.proposal || {};
  if (!proposal.proposalId || hasContentSelection(proposal)) return null;
  const normalized = topologyAdapter.normalize({ topology: {
    marketMode: proposal.topology, morphology: proposal.topology, version: proposal.version,
    proposedBy: 'morphogenesis', partitionByModule: proposal.marketStructure?.partitionByModule
  } });
  if (!normalized.supported) return null;
  return { proposalId: proposal.proposalId, topology: normalized.topology,
    status: 'shadow', evidenceRefs: [...new Set(proposal.evidenceRefs || [])], createdAt: Date.now() };
}

async function load(options) {
  return persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
}

async function save(options, loaded, state) {
  await persistence.save({ scope: SCOPE, agentId: options.agentId, db: loaded.db,
    state, version: Date.now() });
}

async function recordProposal(options) {
  if (!options?.agentId) throw new TypeError('Market morphology requires an agent id.');
  const proposal = normalizeProposal(options);
  if (!proposal) return { accepted: false, reason: 'invalid_or_content_selecting_morphology' };
  const loaded = await load(options);
  const proposals = Array.isArray(loaded.state.proposals) ? loaded.state.proposals : [];
  proposals.push(proposal);
  await save(options, loaded, { ...loaded.state, proposals: proposals.slice(-1000) });
  return { accepted: true, proposal };
}

async function activate(options) {
  if (!options?.approvalReceipt) throw new TypeError('Market morphology activation requires an approval receipt.');
  const loaded = await load(options);
  const proposals = Array.isArray(loaded.state.proposals) ? loaded.state.proposals : [];
  const proposal = proposals.find((item) => item.proposalId === options.proposalId);
  if (!proposal) return { activated: false, reason: 'proposal_not_found' };
  const active = { ...proposal, status: 'active', approvalReceipt: options.approvalReceipt, activatedAt: Date.now() };
  await save(options, loaded, { ...loaded.state, activeTopology: active });
  return { activated: true, topology: active };
}

async function topologyForCycle(options) {
  if (options.explicitTopology) return options.explicitTopology;
  const loaded = await load(options);
  return loaded.state.activeTopology?.topology || null;
}

module.exports = { recordProposal, activate, topologyForCycle, normalizeProposal, hasContentSelection, SCOPE };
