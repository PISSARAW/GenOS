'use strict';

const { randomUUID } = require('node:crypto');
const persistence = require('../agowStatePersistenceService');
const partitioner = require('./marketPartitionService');
const topologyAdapter = require('./marketTopologyAdapter');
const regional = require('./regionalWinnerService');

const SCOPE = 'agow_market_receipts';

async function persist(options, receipts) {
  const loaded = await persistence.load({ scope: SCOPE, agentId: options.agentId, db: options.db });
  const history = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  history.push(...receipts);
  await persistence.save({ scope: SCOPE, agentId: options.agentId, db: loaded.db,
    state: { receipts: history.slice(-2000) }, version: history.length });
}

async function compete(options) {
  const normalized = topologyAdapter.normalize({ topology: options.topology });
  if (!normalized.supported) return { applied: false, reason: normalized.reason, regionalWinners: [] };
  const regions = partitioner.partition({ candidates: options.candidates, topology: normalized.topology });
  const results = regions.map((region) => regional.compete({ ...options, ...region }));
  const receipts = results.map((result) => ({ ...result.receipt, receiptId: randomUUID(),
    topology: normalized.topology, localActivationCount: result.winners.length }));
  const regionalWinners = results.flatMap((result, index) => topologyAdapter.withMarketProvenance({
    candidates: result.winners, marketId: result.receipt.marketId,
    receipt: receipts[index], topology: normalized.topology }));
  if (options.agentId && options.db) await persist(options, receipts);
  return { applied: true, topology: normalized.topology, inputCount: options.candidates.length,
    marketCount: regions.length, regionalWinners, receipts };
}

module.exports = { compete, SCOPE };
