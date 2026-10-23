'use strict';

const assert = require('node:assert/strict');
const inventory = require('../../src/services/morphogenesis/topologyCapabilityInventory');
const matrix = require('../../src/services/capabilityAccessMatrix');
const epoch = require('../../src/services/morphogenesis/morphogenesisEpochDecisionService');
const activation = require('../../src/services/agentRuntimeAdapter/missionStrategyActivation');

const observed = inventory.resolveTopologyCapabilityInventory({}, {});
assert.deepEqual(observed.available, matrix.operationalTopologyCapabilities());
assert.equal(observed.source, inventory.SOURCE);
assert.equal(observed.verified, true);
assert.deepEqual(epoch.topologyCapabilities({}), observed.available);
assert.deepEqual(activation.topologyCapabilities({}, {}), observed.available);

const declared = inventory.resolveTopologyCapabilityInventory({
  topologyCapabilityInventory: { available: ['declared-capability'] }
});
assert.deepEqual(declared.available, ['declared-capability']);
assert.equal(declared.source, 'mission-declaration');
assert.equal(declared.verified, false);
process.stdout.write('Morphogenesis capability inventory has an explicit auditable operational source: PASS\n');
