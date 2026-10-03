const assert = require('node:assert/strict');
const Module = require('node:module');

const fakeBootstrap = { getAdaptivePersister: () => null, setAdaptivePersister: () => {} };
const originalLoad = Module._load;
Module._load = function loadWithFakeBootstrap(request, parent, isMain) {
  if (request === '../../adaptiveStateBootstrap') return fakeBootstrap;
  return originalLoad.call(this, request, parent, isMain);
};

(async () => {
try {
  const { handle } = require('../src/services/mcpBioTools/handlers/obligatePolyembryony');
  for (const total_budget_tokens of [0, -2, 1.5, '10', 1000000001]) {
    assert.equal((await handle({ action: 'spawn_obligate_clones', total_budget_tokens })).status, 'invalid_args');
  }
  for (const cleavage_order of [0, 2, 4.5, '8']) {
    assert.equal((await handle({ action: 'spawn_obligate_clones', cleavage_order })).status, 'invalid_args');
  }
  const spawned = await handle({ action: 'spawn_obligate_clones', total_budget_tokens: 10, cleavage_order: 4 });
  assert.equal(spawned.budget_per_clone, 2);
  assert.equal(spawned.execution_scope, 'metadata_simulation');
  assert.equal(spawned.runtime_agents_created, false);
  const inputs = spawned.clones.slice(0, 3).map(clone => ({ clone_id: clone.cloneId, proposed_solution: 'same' }));
  const duplicate = await handle({ action: 'evaluate_polyembryonic_quorum', cluster_id: spawned.cluster_id,
    clone_outputs: [inputs[0], inputs[0], inputs[0]] });
  assert.equal(duplicate.status, 'invalid_args');
  const unknown = await handle({ action: 'evaluate_polyembryonic_quorum', cluster_id: spawned.cluster_id,
    clone_outputs: [{ clone_id: 'not-a-clone', proposed_solution: 'same' }] });
  assert.equal(unknown.status, 'invalid_args');
  const quorum = await handle({ action: 'evaluate_polyembryonic_quorum', cluster_id: spawned.cluster_id, clone_outputs: inputs });
  assert.equal(quorum.quorum_reached, true);
  assert.equal(quorum.runtime_promotion_applied, false);
} finally {
  Module._load = originalLoad;
}

console.log('obligate polyembryony validation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
