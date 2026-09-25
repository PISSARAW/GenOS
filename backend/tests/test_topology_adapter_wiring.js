'use strict';

const assert = require('node:assert/strict');
const { adaptTopologyTransition, registry } = require('../src/services/morphogenesis/adapters/topologyAdapterService');
const { createTopologyAdapterRegistry } = require('../src/services/morphogenesis/adapters/topologyAdapterRegistry');

const topologies = ['trinity', 'a_team', 'biome', 'biocenose', 'holobionte', 'syncytium', 'rhizome', 'metapopulation'];

function verifyImplementedAdapter() {
  const result = adaptTopologyTransition({
    fromTopology: 'Trinity',
    toTopology: 'A-Team',
    payload: {
      verifiedClaims: [{ id: 'verified', text: 'supported', verified: true }, { id: 'unverified', text: 'excluded' }],
      constraints: ['interface contract']
    }
  });
  assert.equal(result.supported, true);
  assert.equal(result.receipt.evidenceStatus, 'tested');
  assert.equal(result.payload.workPackages.length, 1);
  assert.equal(result.payload.excludedClaims, 1);
}

function verifyUnsupportedTransitionsFailClosed() {
  for (const fromTopology of topologies) {
    for (const toTopology of topologies) {
      const result = adaptTopologyTransition({ fromTopology, toTopology, payload: {} });
      const expected = fromTopology === toTopology || (fromTopology === 'trinity' && toTopology === 'a_team');
      assert.equal(result.supported, expected, `${fromTopology} -> ${toTopology}`);
    }
  }
  assert.equal(adaptTopologyTransition({ fromTopology: 'unknown', toTopology: 'a_team' }).reason, 'unknown_topology');
}

function verifyRegistrationValidation() {
  const adapters = createTopologyAdapterRegistry();
  assert.throws(() => adapters.register({
    id: 'unknown-endpoint', version: '1', fromTopology: 'unknown', toTopology: 'a_team', adapt: (value) => value
  }), /canonical topologies/);
  assert.equal(registry.list().length, 1);
}

verifyImplementedAdapter();
verifyUnsupportedTransitionsFailClosed();
verifyRegistrationValidation();
console.log('Topology adapter wiring checks: PASS');
