'use strict';

const assert = require('node:assert/strict');
const conductivity = require('../src/services/rhizome/routing/conductivityService');

function edge(edgeId, values) {
  return {
    edgeId, conductivity: values.conductivity,
    trailState: { positive: values.positive, negative: values.negative, verifiedFlow: values.verifiedFlow, updatedAt: null }
  };
}

function run() {
  const session = {
    graphVersion: 6,
    edges: [edge('useful', { conductivity: 0.5, positive: 10, negative: 0, verifiedFlow: 50 }), edge('failed', { conductivity: 0.5, positive: 0, negative: 100, verifiedFlow: 0 })]
  };
  const result = conductivity.step({ session, alpha: 0.2, beta: 0.4, decay: 0.02 });
  assert.equal(result.graphVersion, 7);
  assert.equal(session.edges[0].conductivity, 0.59);
  assert.equal(session.edges[1].conductivity, 0.09);
  assert.equal(session.edges[0].trailState.verifiedFlow, 0);

  const capped = conductivity.step({
    session: { graphVersion: 0, edges: [edge('capped', { conductivity: 1, positive: 100, negative: 0, verifiedFlow: 100 })] }, alpha: 1, beta: 1, decay: 0
  });
  assert.equal(capped.edges[0].conductivity, 1);
}

run();
console.log('Rhizome conductivity tests passed.');
