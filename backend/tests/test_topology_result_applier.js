'use strict';

const assert = require('node:assert/strict');
const { applyTopologyResults } = require('../src/services/topology/topologyResultApplier.cjs');

async function unavailableFailsClosed() {
  const result = await applyTopologyResults({ mode: 'biocenose' });
  assert.deepEqual(result, { applied: false, status: 'BLOCKED',
    reason: 'TOPOLOGY_RESULT_APPLIER_UNAVAILABLE', mode: 'biocenose' });
}

async function injectedApplierIsObserved() {
  const result = await applyTopologyResults({ mode: 'biome', marker: 'input' }, {
    biome: { async apply(input) {
      assert.equal(input.marker, 'input');
      return { status: 'PROGRESSED', receiptId: 'receipt-1' };
    } }
  });
  assert.deepEqual(result, { applied: true, status: 'PROGRESSED',
    mode: 'biome', receiptId: 'receipt-1' });
}

async function applierErrorsPropagate() {
  await assert.rejects(() => applyTopologyResults({ mode: 'holobionte' }, {
    holobionte: { async apply() {
      throw Object.assign(new Error('invalid evidence'), { code: 'EVIDENCE_INVALID' });
    } }
  }), (error) => error.code === 'EVIDENCE_INVALID');
}

async function main() {
  await unavailableFailsClosed();
  await injectedApplierIsObserved();
  await applierErrorsPropagate();
  process.stdout.write('Topology result applier: PASS\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
