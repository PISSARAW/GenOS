'use strict';

const assert = require('node:assert/strict');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');
const { DOCUMENTED_VARIANTS } = require('../src/services/metapopulation/policy/metapopulationPolicyService');
const { generateMutationParams, sampleMutations } = require('../src/services/morphogenesis/synthesis/morphogenContext');

function randomSequence(...values) {
  return () => values.shift();
}

const registry = createTopologyRegistry();
const topologies = registry.list();
assert.equal(topologies.length, 8);
let covered = 0;

for (const [topologyIndex, topology] of topologies.entries()) {
  const variants = topology === 'metapopulation' ? DOCUMENTED_VARIANTS
    : registry.variants.list(topology).filter((variant) => variant !== 'default');
  for (const [variantIndex, variant] of variants.entries()) {
    const added = generateMutationParams('ADD_NODE', {
      random: randomSequence((topologyIndex + 0.5) / topologies.length,
        (variantIndex + 0.5) / variants.length)
    });
    assert.equal(added.topology, topology);
    assert.equal(added.variant, variant);
    covered++;
  }
  const expression = { kind: 'TOPOLOGY', topology, variant: variants[0] };
  const alternatives = variants.slice(1);
  for (const [index, variant] of alternatives.entries()) {
    const changed = generateMutationParams('CHANGE_VARIANT', {
      expression, random: randomSequence((index + 0.5) / alternatives.length)
    });
    assert.equal(changed.newVariant, variant);
  }
}

assert.equal(covered, 95);
const source = { kind: 'TOPOLOGY', topology: 'trinity', variant: 'controlled' };
const topologyChange = generateMutationParams('CHANGE_TOPOLOGY', {
  expression: source, random: randomSequence(0, 0)
});
assert.notEqual(topologyChange.newTopology, source.topology);
assert.ok(registry.variants.list(topologyChange.newTopology).includes(topologyChange.newVariant));
assert.throws(() => generateMutationParams('CHANGE_VARIANT'), /requires a topology expression/);
assert.deepEqual(sampleMutations({ CHANGE_VARIANT: 1 }, 1, {
  expression: { kind: 'PARALLEL', children: [source] }, random: () => 0
}), []);

console.log('Morphogenesis catalog mutations: PASS');
