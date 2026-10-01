'use strict';

const assert = require('node:assert/strict');
const adapter = require('../src/services/agow/candidates/candidateAdapterService');
const markets = require('../src/services/agow/markets/cognitiveMarketService');
const partitioner = require('../src/services/agow/markets/marketPartitionService');

function candidate(module, id) {
  return adapter.build({ module, agentId: 'market-test', now: 10, observation: {
    candidateId: id, confidence: 0.8, goalMatched: true, evidenceCoverage: 1, evidenceRefs: ['e']
  } });
}

async function main() {
  const candidates = [candidate('memory', 'm1'), candidate('memory', 'm2'), candidate('perception', 'p1')];
  const regions = partitioner.partition({ candidates, topology: { marketMode: 'domain' } });
  assert.equal(regions.length, 2);
  const result = await markets.compete({ candidates, topology: { name: 'a_team', proposedBy: 'morphogenesis' }, capacity: 1 });
  assert.equal(result.applied, true);
  assert.equal(result.marketCount, 2);
  assert.equal(result.regionalWinners.length, 2);
  assert.deepEqual(result.regionalWinners[0].marketPath.length, 2);
  assert.equal(result.regionalWinners[0].regionalReceipt, result.receipts[0].receiptId);
  assert.equal(result.receipts[0].topology.proposedBy, 'morphogenesis');
  console.log('✅ AGOW topology-aware regional markets and provenance passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
