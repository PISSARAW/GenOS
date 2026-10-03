'use strict';

const assert = require('node:assert/strict');
const resolver = require('../src/services/morphogenesis/topologyResolverService');

const base = { problemProfile: { territoryId: 'territory.morpho-test' } };

const withoutRuntime = resolver.scoreTopology('holobionte', base);
assert.equal(withoutRuntime.factors.daemon_support, 0);

const unverified = resolver.scoreTopology('holobionte', {
  ...base,
  daemonSupport: { holobionte: { status: 'HEALTHY', score: 1, territoryId: 'territory.morpho-test' } }
});
assert.equal(unverified.factors.daemon_support, 0);

const staleTerritory = resolver.scoreTopology('holobionte', {
  ...base,
  daemonSupport: { holobionte: {
    status: 'HEALTHY', score: 1, daemonId: 'daemon.test', headSha: 'a'.repeat(40),
    territoryId: 'territory.other', evidenceRef: 'provenance:daemon'
  } }
});
assert.equal(staleTerritory.factors.daemon_support, 0);

const measured = resolver.scoreTopology('holobionte', {
  ...base,
  daemonSupport: { holobionte: {
    status: 'HEALTHY', score: 0.75, daemonId: 'daemon.test', headSha: 'a'.repeat(40),
    territoryId: 'territory.morpho-test', evidenceRef: 'provenance:daemon'
  } }
});
assert.equal(measured.factors.daemon_support, 0.75);

console.log('topology daemon support: measured territory evidence required');
