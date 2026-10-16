'use strict';

const assert = require('node:assert/strict');
const { CANONICAL_TOPOLOGIES, operationHandler } = require('../src/services/topologySessionTools');

async function main() {
  assert.equal(CANONICAL_TOPOLOGIES.size, 8);
  for (const topology of CANONICAL_TOPOLOGIES) {
    const record = { id: `session-${topology}`, topology, variantId: 'variant', revision: 3,
      state: { variantId: 'variant', evidence: topology } };
    const inspect = operationHandler(topology, 'inspect');
    const snapshot = operationHandler(topology, 'snapshot');
    const events = operationHandler(topology, 'events');
    assert.equal(typeof inspect, 'function', `${topology} inspect dispatch`);
    assert.equal(typeof snapshot, 'function', `${topology} snapshot dispatch`);
    assert.equal(typeof events, 'function', `${topology} events dispatch`);
    assert.equal((await inspect(null, record.id, {}, record)).variantId, 'variant');
    if (!['biome', 'rhizome', 'syncytium'].includes(topology)) {
      assert.deepEqual((await snapshot(null, record.id, {}, record)).state, record.state);
    }
  }
  assert.equal(operationHandler('unknown', 'inspect'), undefined);
  console.log('Topology session dispatch matrix: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
