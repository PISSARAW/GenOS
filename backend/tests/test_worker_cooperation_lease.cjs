'use strict';

const assert = require('node:assert/strict');
const { leaseBound } = require('./helpers/workerCooperationCoverage.cjs');
const stage = { kind: 'resident_daemon', factoryToolLease: ['genos_snapshot'],
  runtimeAuthority: { toolLease: ['genos_snapshot', 'genos_replay'] } };
assert.equal(leaseBound(stage), true, 'Native replay is added by the sealed envelope policy.');
assert.equal(leaseBound({ ...stage, runtimeAuthority: { toolLease: ['genos_orchestrate'] } }), false);
assert.equal(leaseBound({ ...stage, factoryToolLease: [] }), false, 'An empty factory lease must not gain snapshot.');
assert.equal(leaseBound({ ...stage, factoryToolLease: [], runtimeAuthority: { toolLease: ['genos_replay'] } }), true);
assert.equal(leaseBound({ ...stage, factoryToolLease: undefined }), false);
assert.equal(leaseBound({ ...stage, runtimeAuthority: undefined }), false);
console.log('Cooperation lease coverage: native replay accounted separately; missing and arbitrary widened leases refused PASS.');
