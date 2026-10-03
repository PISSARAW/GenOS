const assert = require('node:assert/strict');
const Module = require('node:module');
const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const moduleUnderTest = require('../src/services/mcpBioTools/handlers/transposonJump');
  const { handleTransposonJump } = moduleUnderTest;
  const invalid = handleTransposonJump({ action: 'cut_and_paste_jump', id: 'trans-check', target_locus: '__proto__' });
  assert.equal(invalid.status, 'invalid_target');
  const record = moduleUnderTest.transposonRegistry.get('trans-check');
  assert.equal(Object.getPrototypeOf(record.loci), Object.prototype);
  assert.equal(record.transposons[0].currentLocus, 'LOCUS_B');

  const sameLocus = handleTransposonJump({ action: 'cut_and_paste_jump', id: 'trans-check', target_locus: 'LOCUS_B' });
  assert.equal(sameLocus.status, 'no_op');
  assert.equal(record.transposons[0].jumpsCount, 0);

  const copied = handleTransposonJump({ action: 'copy_and_paste_retrojump', id: 'trans-check', target_locus: 'LOCUS_C' });
  assert.equal(copied.execution_scope, 'metadata_simulation');
  assert.equal(copied.runtime_genome_changed, false);
  record.transposons.length = 64;
  assert.equal(handleTransposonJump({ action: 'copy_and_paste_retrojump', id: 'trans-check' }).status, 'copy_cap_reached');
} finally {
  Module._load = originalLoad;
}

console.log('transposon jump validation passed');
