'use strict';

const assert = require('node:assert/strict');
const { hostFrom, missionTextFrom } = require('../src/services/morphogenesis/runtime/topologyPlugins');

assert.equal(hostFrom({}, {}), 'morphogenesis-host', 'Holobionte defaults must accept missing workers');
assert.equal(hostFrom({ workers: [{ id: 'host-1' }] }, {}), 'host-1');
assert.equal(missionTextFrom({}, { missionText: 'Inspect the region' }, { missionId: 'mission-id' }), 'Inspect the region');
assert.throws(() => missionTextFrom({}, {}, { missionId: 'mission-id' }), /requires a mission text/);
console.log('Topology plugins enforce text inputs and safe optional workers: PASS');
