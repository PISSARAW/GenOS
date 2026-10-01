'use strict';

const MODES = new Set(['domain', 'a_team', 'trinity', 'biome', 'rhizome', 'syncytium']);

function normalize(options = {}) {
  const source = options.topology || {};
  const marketMode = String(source.marketMode || source.name || 'domain').toLowerCase();
  if (!MODES.has(marketMode)) return { supported: false, reason: 'unsupported_market_topology' };
  return { supported: true, topology: { marketMode, morphology: source.morphology || marketMode,
    version: source.version || null, proposedBy: source.proposedBy || null,
    partitionByModule: safePartitionMap(source.partitionByModule) } };
}

function safePartitionMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([module, region]) =>
    typeof module === 'string' && typeof region === 'string' && region.length > 0).slice(0, 100));
}

function withMarketProvenance(options) {
  return options.candidates.map((candidate) => ({ ...candidate,
    marketPath: [options.marketId, 'global'], localCompetitors: options.receipt.competitorIds,
    localWinnerReason: 'regional_competition', regionalReceipt: options.receipt.receiptId,
    marketTopology: options.topology.morphology }));
}

module.exports = { normalize, withMarketProvenance, safePartitionMap, MODES };
