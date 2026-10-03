const assert = require('node:assert/strict');
const Module = require('node:module');
const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const { handleAneuploidy } = require('../src/services/mcpBioTools/handlers/aneuploidy');
  for (const votes of [[], Array(129).fill('A'), [''], ['x'.repeat(129)]]) {
    assert.equal(handleAneuploidy({ action: 'resolve_aneuploid_consensus', votes }).status, 'invalid_args');
  }
  assert.equal(handleAneuploidy({ action: 'induce_trisomy', target_chromosome: '__proto__' }).status, 'invalid_args');
  const tie = handleAneuploidy({ action: 'resolve_aneuploid_consensus', votes: ['__proto__', 'constructor'] });
  assert.equal(tie.winner, null);
  assert.equal(tie.supermajority_achieved, false);
  const majority = handleAneuploidy({ action: 'resolve_aneuploid_consensus', votes: ['APPROVE', 'APPROVE', 'REJECT'] });
  assert.equal(majority.winner, 'APPROVE');
  assert.equal(majority.supermajority_achieved, true);
  const mutation = handleAneuploidy({ action: 'induce_trisomy', id: 'aneu-check' });
  assert.equal(mutation.runtime_genome_changed, false);
  assert.equal(mutation.execution_scope, 'metadata_simulation');
} finally {
  Module._load = originalLoad;
}

console.log('aneuploidy consensus checks passed');
