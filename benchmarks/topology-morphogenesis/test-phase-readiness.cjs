'use strict';

const assert = require('node:assert/strict');
const { missingTopologyProbes, topologyProbeAdmissible } = require('./check-phase-readiness.cjs');

function run() {
  const sessionProbe = { id: 'topologie-syncytium', family: 'topology',
    mechanismProbe: 'renamed-session-probe', mechanismProbeScope: 'session-mechanism-observation',
    mechanismProbeVerificationEligible: false, oracle: { status: 'missing' } };
  assert.deepEqual(missingTopologyProbes([sessionProbe]), ['topologie-syncytium'],
    'renaming an inadmissible probe must not satisfy readiness');

  const eligibleWithoutOracle = { ...sessionProbe, mechanismProbeScope: 'mission-outcome',
    mechanismProbeVerificationEligible: true };
  assert.deepEqual(missingTopologyProbes([eligibleWithoutOracle]), ['topologie-syncytium'],
    'mission-outcome evidence still requires an independent oracle');

  const admissible = { ...eligibleWithoutOracle, oracle: { status: 'independent' } };
  assert.equal(topologyProbeAdmissible(admissible), true);
  assert.deepEqual(missingTopologyProbes([admissible]), []);

  const current = require('./suite.json');
  assert.deepEqual(missingTopologyProbes(current.tasks), current.tasks
    .filter((task) => task.family === 'topology').map((task) => task.id),
  'all current topology rows remain blocked until mission probes and independent oracles exist');
  console.log('Topology readiness requires admissible mission-outcome evidence and an independent oracle: PASS');
}

run();
