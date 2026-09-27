'use strict';

const assert = require('assert');
const { createValidationProtocol, verifyManifest } = require('../src/services/validationProtocolService');

function item(id, split) { return { id, split, payload: `${split}-${id}` }; }

async function main() {
  const protocol = createValidationProtocol({
    protocolId: 'indicators-lot05', revision: 'v1', hypothesis: 'isolated evidence preserves calibration',
    criteria: { primaryMetric: 'calibration_error', direction: 'lower', threshold: 0.2 }, seeds: [7, 19],
    corpus: { train: [item('tr-1', 'train')], dev: [item('dv-1', 'dev')], reserved: [item('rs-1', 'reserved')] },
  });
  assert.deepStrictEqual(protocol.counts, { train: 1, dev: 1, reserved: 1 });
  assert.ok(protocol.manifestHash.length === 64);
  assert.ok(Object.isFrozen(protocol) && Object.isFrozen(protocol.corpus));
  assert.deepStrictEqual(verifyManifest(protocol, protocol.manifestHash).valid, true);
  assert.throws(() => createValidationProtocol({ ...protocol, corpus: { ...protocol.corpus, dev: [item('tr-1', 'dev')] } }), (error) => error.code === 'CORPUS_LEAK');
  assert.throws(() => verifyManifest(protocol, 'bad-hash'), (error) => error.code === 'MANIFEST_MISMATCH');
  console.log('✅ validation protocol tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
