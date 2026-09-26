'use strict';

const assert = require('node:assert/strict');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');

function run() {
  const registry = createTopologyRegistry();
  const aTeam = registry.variants.resolve('a_team', 'project_dag');
  assert.equal(aTeam.maturity, 'implemented');
  assert.equal(aTeam.parameters.communication, 'dependency_driven');
  assert.match(aTeam.source, /aTeam\/variants/);
  assert.equal(registry.variants.list('trinity').filter((variant) => variant !== 'default').length, 12);
  assert.equal(registry.variants.resolve('trinity', 'factorial').maturity, 'implemented');

  const biocenose = registry.variants.resolve('biocenose', 'argumentation_community');
  assert.equal(biocenose.maturity, 'partial');
  const syncytium = registry.variants.resolve('syncytium', 'code');
  assert.deepEqual(syncytium.requiredCapabilities, ['CRDT_SHARED_STATE', 'SEMANTIC_CONFLICTS', 'EVIDENCE_BARRIER']);
  const humanAi = registry.variants.resolve('syncytium', 'humanAi');
  assert.equal(humanAi.maturity, 'implemented');
  assert.deepEqual(humanAi.requiredCapabilities, ['CRDT_SHARED_STATE', 'HUMAN_AUTHORITY', 'AUTHORSHIP', 'EXPLICIT_CONSENT']);
  const rhizome = registry.variants.resolve('rhizome', 'resilient');
  assert.equal(rhizome.parameters.resilience.alternatives, 4);
  assert.equal(registry.variants.resolve('holobionte', 'adaptive-microbiome').maturity, 'partial');
  assert.equal(registry.variants.resolve('metapopulation', 'conservative').parameters.quorumRatio, 0.7);
  assert.equal(registry.variants.resolve('biome', 'resource').maturity, 'partial');
  assert.equal(registry.variants.resolve('biome', 'multi_scale').parameters.levels.length, 3);

  for (const topology of registry.list()) {
    assert.deepEqual(registry.get(topology).variants, registry.variants.list(topology));
  }
  assert.equal(registry.get('a_team').variants.includes('red_blue_coevolution'), false);
  assert.equal(registry.variants.resolve('a_team', 'missing'), null);
  aTeam.parameters.communication = 'mutated';
  assert.equal(registry.variants.resolve('a_team', 'project_dag').parameters.communication, 'dependency_driven');
  console.log('Morphogenesis variant catalog: PASS');
}

run();
