'use strict';

const assert = require('node:assert/strict');
const { createTopologyRegistry } = require('../src/services/morphogenesis/registry/topologyRegistry');
const { SPEC_VERSION } = require('../src/services/morphogenesis/registry/variantSpec');
const { installTopologyPlugins, PLUGIN_TOPOLOGIES } = require('../src/services/morphogenesis/runtime/topologyPlugins');
const { withTopologyOutcome } = require('../src/services/morphogenesis/runtime/topologyOutcome');
const { createTopologyRuntimePort } = require('../src/services/morphogenesis/runtime/topologyRuntimePort');

async function verifyPortContract() {
  const port = createTopologyRuntimePort({
    topology: 'test', executionKind: 'canonical_service',
    morphogenesis: { observe: 'verified', restore: 'unsupported' },
    lifecycle: { observe: async () => ({ observed: true }) },
    execute: async ({ args }) => ({ value: args.value })
  });
  assert.equal(port.contractVersion, '1.1.0');
  assert.equal(port.supports('observe'), true);
  assert.equal(port.qualified('observe'), true);
  assert.equal(port.supports('restore'), false);
  const output = await port.run({ value: 7 }, {});
  assert.equal(output.value, 7);
  assert.equal(output.runtimePort.topology, 'test');
  assert.equal(output.runtimePort.morphogenesis.snapshot, 'unknown');
}

async function verifyEightInstalledPorts() {
  const plugins = new Map();
  const installed = installTopologyPlugins({
    registerTopology: (name, plugin) => plugins.set(name, plugin)
  });
  assert.deepEqual([...plugins.keys()].sort(), [...PLUGIN_TOPOLOGIES].sort());
  assert.deepEqual(Object.keys(installed.ports).sort(), [...PLUGIN_TOPOLOGIES].sort());
  for (const topology of PLUGIN_TOPOLOGIES) {
    const descriptor = plugins.get(topology).describe();
    assert.equal(descriptor.topology, topology);
    assert.equal(descriptor.contractVersion, '1.1.0');
    assert.ok(descriptor.morphogenesis.observe);
  }
  const syncytium = await plugins.get('syncytium').run({}, {
    input: { document: {}, operations: [] }
  });
  assert.equal(syncytium.executionMode, 'simulated_controller');
  assert.equal(syncytium.runtimePort.executionKind, 'simulation_adapter');
}

function verifyVariantSpecV2() {
  const registry = createTopologyRegistry();
  const alias = registry.variants.resolve('trinity', 'default');
  const preset = registry.variants.resolve('trinity', 'controlled');
  const profile = registry.variants.resolve('metapopulation', 'balanced');
  const variant = registry.variants.resolve('a_team', 'project_dag');
  assert.equal(alias.specVersion, SPEC_VERSION);
  assert.equal(alias.specKind, 'alias');
  assert.equal(preset.specKind, 'preset');
  assert.equal(profile.specKind, 'profile');
  assert.equal(variant.specKind, 'variant');
  assert.equal(variant.qualification.catalogued, 'verified');
  assert.equal(variant.qualification.runtimeBinding, 'declared');
  assert.equal(variant.qualification.restorable, 'unknown');
}

function verifyTopologyOutcome() {
  const output = withTopologyOutcome({ status: 'NO_ACTION', actionCount: 0 }, {
    topology: 'metapopulation', variant: 'balanced'
  });
  assert.equal(output.executionStatus, 'completed');
  assert.equal(output.missionOutcome, 'no_action');
  assert.equal(output.topologyOutcome.schemaVersion, '1.0.0');
  assert.equal(output.topologyOutcome.topologyId, 'metapopulation');
  assert.equal(output.topologyOutcome.variantId, 'balanced');
  assert.equal(output.topologyOutcome.promotionEligible, false);

  const verified = withTopologyOutcome({ verdict: 'PASS',
    executionProof: { promotionEligible: true } }, { topology: 'trinity' });
  assert.equal(verified.topologyOutcome.evidenceStatus, 'verified');
  assert.equal(verified.topologyOutcome.missionOutcome, 'verified');
  assert.equal(verified.topologyOutcome.promotionEligible, true);
}

async function run() {
  await verifyPortContract();
  await verifyEightInstalledPorts();
  verifyVariantSpecV2();
  verifyTopologyOutcome();
  console.log('Morphogenesis P0 architecture: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
