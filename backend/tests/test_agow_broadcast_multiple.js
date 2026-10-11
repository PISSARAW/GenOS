'use strict';
const assert = require('node:assert/strict');
const pool = require('../src/services/agow/candidatePoolService');
const registry = require('../src/services/agow/workspaceReceiverRegistry');
const receipts = require('../src/services/agow/broadcastReceiptService');
const mediation = require('../src/services/agow/workspaceMediationService');
const broadcast = require('../src/services/agow/workspaceBroadcastService');

const original = { list: pool.list, receivers: registry.list, record: receipts.record,
  mediation: mediation.record };
const observed = [];
pool.list = async () => [{ candidateId: 'fact-a' }, { candidateId: 'fact-b' }];
registry.list = () => [{ module: 'planning', handler: async (input) => {
  if (input.phase === 'inspect') return { state: null };
  observed.push(input.candidates.map((item) => item.candidateId));
  return { consumed: true, changed: true, artifactRefs: ['answer://ab'] };
} }];
receipts.record = async (input) => input;
mediation.record = async () => null;

async function main() {
  try {
    const frame = { agentId: 'attention-test', frameId: 'frame-1', cycle: 1,
      primaryContent: 'fact-a', secondaryContents: ['fact-b'] };
    const result = await broadcast.publish({ frame, modules: ['planning'], db: {}, skipTransport: true });
    assert.deepEqual(observed, [['fact-a', 'fact-b']]);
    assert.deepEqual(result.deliveries[0].candidateIds, ['fact-a', 'fact-b']);
    console.log('AGOW broadcasts primary and secondary content to authorized receiver.');
  } finally {
    pool.list = original.list;
    registry.list = original.receivers;
    receipts.record = original.record;
    mediation.record = original.mediation;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
