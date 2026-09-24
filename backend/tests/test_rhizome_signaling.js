'use strict';

const assert = require('node:assert/strict');
const ligandService = require('../src/services/rhizome/signaling/capabilityLigandService');
const propagationService = require('../src/services/rhizome/propagation/proceduralPropagationService');

function session() {
  return { nodes: [
    { nodeId: 'source', capabilities: ['parse_schema'], provenance: ['test:source'], state: 'ACTIVE' },
    { nodeId: 'receiver', capabilities: ['transform'], provenance: [], state: 'AVAILABLE', localContext: { receptors: ['parse_schema'] } },
    { nodeId: 'other', capabilities: ['store'], provenance: [], state: 'ACTIVE', localContext: { receptors: ['query_database'] } }
  ] };
}

function run() {
  const signal = ligandService.publish(session(), {
    signalId: 'ligand-1', sourceNodeId: 'source', capability: 'parse_schema',
    evidenceRefs: ['test:source'], scope: 'mission'
  });
  assert.deepEqual(signal.recipientNodeIds, ['receiver']);
  assert.throws(() => ligandService.publish(session(), {
    signalId: 'forged', sourceNodeId: 'source', capability: 'parse_schema', evidenceRefs: ['unknown']
  }), { code: 'RHIZOME_SIGNAL_REJECTED' });

  const fragment = { source: 'proc-1', procedure: { strategy: 'local-first' } };
  const target = { role: 'worker' };
  const blocked = propagationService.propagate({ fragment, target, relevance: 1, compatibility: 1, provenUtility: 1, assimilationCost: 0 });
  assert.equal(blocked.assimilated, false);
  const accepted = propagationService.propagate({
    fragment, target, relevance: 1, compatibility: 1, provenUtility: 0.9, assimilationCost: 0.1,
    localValidation: { status: 'VERIFIED', evidenceRefs: ['local-test:ok'] }
  });
  assert.equal(accepted.assimilated, true);
  assert.equal(accepted.result.strategy, 'local-first');

  const irrelevant = propagationService.propagate({
    fragment, target, relevance: 0.1, compatibility: 0.1, provenUtility: 0.2, assimilationCost: 0.4,
    localValidation: { status: 'VERIFIED', evidenceRefs: ['local-test:ok'] }
  });
  assert.equal(irrelevant.assimilated, false);
}

run();
console.log('Rhizome signaling and propagation tests passed.');
