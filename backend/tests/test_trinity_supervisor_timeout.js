'use strict';

const assert = require('node:assert/strict');
const topologyHandler = require('../bin/topologyTrinityHandler.cjs');

const base = [{ variantSelection: { variant: 'adversarial' }, worldNumber: 1, modelTier: 'standard' }];
assert.equal(topologyHandler.withDispatchRuntime(base, {}).supervisionTimeoutMs, 180000);
assert.equal(topologyHandler.withDispatchRuntime(base, { timeoutMs: 420000 }).supervisionTimeoutMs, 420000);
assert.equal(topologyHandler.withDispatchRuntime(base, { trinitySupervisorTimeoutMs: 540000, timeoutMs: 420000 }).supervisionTimeoutMs, 540000);
assert.equal(topologyHandler.withDispatchRuntime(base, { timeoutMs: 900000 }).supervisionTimeoutMs, 600000);

const supervisor = require('../bin/trinity-supervisor.cjs');
assert.equal(supervisor.expectedWorlds({ experimentalDesign: { worldTopology: 'factorial_grid' } }), 16);
assert.equal(supervisor.expectedWorlds({ experimentalDesign: { worldTopology: 'fixed_three' } }), 3);

process.stdout.write('Trinity supervisor honors a bounded mission timeout for all world counts.\n');
