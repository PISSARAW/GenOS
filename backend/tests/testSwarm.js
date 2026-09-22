'use strict';

/**
 * @file testSwarm.js
 * @description Swarm telemetry tests
 */

async function runSwarmTests(options = {}) {
  const { request, assert } = options;
  console.log('\n--- 6. Swarm Telemetry: Shannon Entropy & Dynamic Topology ---');
  const swarmMetricsRes = await request({ method: 'GET', path: '/api/swarm/metrics' });
  assert(swarmMetricsRes.status === 200 && swarmMetricsRes.body.rawEntropy !== undefined, 'GET /api/swarm/metrics returned Shannon entropy H(A)');
  assert(swarmMetricsRes.body.cognitiveDriftState !== undefined, 'Cognitive drift state detected');

  const swarmTopoRes = await request({ method: 'GET', path: '/api/swarm/topology' });
  assert(swarmTopoRes.status === 200 && swarmTopoRes.body.nodes.length >= 3 && swarmTopoRes.body.particles !== undefined, 'GET /api/swarm/topology returned nodes and particle message flows');
}

module.exports = { runSwarmTests };