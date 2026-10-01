'use strict';

const assert = require('node:assert/strict');
const adapter = require('../src/services/agow/candidates/candidateAdapterService');
const markets = require('../src/services/agow/markets/cognitiveMarketService');
const partitioner = require('../src/services/agow/markets/marketPartitionService');
const morphogenesis = require('../src/services/agow/markets/morphogenesisMarketAdapter');

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
  assert.equal(morphogenesis.normalizeProposal({ proposal: { proposalId: 'unsafe', topology: 'trinity',
    winner: 'candidate-1' } }), null);
  const db = database();
  const proposal = await morphogenesis.recordProposal({ agentId: 'market-test', db, proposal: {
    proposalId: 'morph-1', topology: 'trinity', version: 'v1', evidenceRefs: ['adr:topology'],
    marketStructure: { partitionByModule: { memory: 'world-a', verifier: 'world-b' } }
  } });
  assert.equal(proposal.accepted, true);
  assert.equal(await morphogenesis.topologyForCycle({ agentId: 'market-test', db }), null);
  assert.equal((await morphogenesis.activate({ agentId: 'market-test', db, proposalId: 'morph-1', approvalReceipt: 'approval-1' })).activated, true);
  const activeTopology = await morphogenesis.topologyForCycle({ agentId: 'market-test', db });
  assert.equal(activeTopology.marketMode, 'trinity');
  assert.equal(partitioner.marketKey(candidate('memory', 'm2'), activeTopology), 'region:world-a');
  console.log('✅ AGOW topology-aware regional markets and provenance passed');
}

function database() {
  const objects = new Map();
  return { async get(_sql, scope, key) { return objects.has(`${scope}:${key}`) ? { payload_json: objects.get(`${scope}:${key}`) } : null; },
    async run(sql, scope, key, payload) { if (sql.includes('INSERT OR REPLACE INTO adaptive_state')) objects.set(`${scope}:${key}`, payload); return { changes: 1 }; } };
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
