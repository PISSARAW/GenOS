'use strict';

const assert = require('node:assert/strict');
const { missingTopologyProbes, topologyProbeAdmissible, missingMissionOracles,
  nonMissionProbePromoted, hasIndependentMissionOracle } = require('./check-phase-readiness.cjs');
const { isMissionOutcomeQualified, unqualifiedMissionOutcomes, qualifyHistoricalEnd,
  qualifyHistoricalCampaign, evaluateQualification } = require('./campaignQualification.cjs');

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

  const noOracle = { id: 'topologie-trinity', family: 'topology',
    mechanismProbe: 'trinity-component-probe', mechanismProbeScope: 'component-smoke-only',
    mechanismProbeVerificationEligible: false, oracle: { status: 'missing', kind: 'missing' } };
  assert.equal(hasIndependentMissionOracle(noOracle), false);
  assert.deepEqual(missingMissionOracles([noOracle]), ['topologie-trinity'],
    'a scenario without a mission oracle must be refused');
  assert.deepEqual(missingMissionOracles([admissible]), [],
    'an independent mission oracle must satisfy the oracle gate');

  const smokePromoted = { ...noOracle, mechanismProbeVerificationEligible: true };
  assert.equal(topologyProbeAdmissible(smokePromoted), false);
  assert.deepEqual(nonMissionProbePromoted([smokePromoted]), ['topologie-trinity'],
    'a component-smoke-only probe presented as mission evidence must be refused');
  assert.deepEqual(nonMissionProbePromoted([sessionProbe]), [],
    'a non-promoted observation probe must not trip the promotion gate');
  assert.deepEqual(nonMissionProbePromoted([admissible]), [],
    'a genuine mission-outcome probe must not trip the promotion gate');

  const unverifiedEnd = { name: 'topologie-trinity', lifecycle: 'completed_unverified',
    receiptObjectSha256: 'a'.repeat(64), orchestratorId: 'orc-1',
    oracleVerification: { status: 'missing', passed: null }, verification: { passed: false, failures: ['x'] } };
  assert.equal(isMissionOutcomeQualified(unverifiedEnd), false);
  assert.deepEqual(unqualifiedMissionOutcomes([{ ...unverifiedEnd, lifecycle: 'verified' }]), ['topologie-trinity'],
    'a verified lifecycle without an independent oracle must be flagged');
  assert.equal(qualifyHistoricalEnd({ ...unverifiedEnd, lifecycle: 'verified' }), 'unverified',
    'a historical unverified mission end must never be requalified as verified');
  assert.equal(qualifyHistoricalEnd({ name: 'x' }), 'inconclusive',
    'a historical mission without any receipt must be inconclusive');
  const historical = qualifyHistoricalCampaign([{ ...unverifiedEnd, lifecycle: 'verified' }]);
  assert.equal(historical[0].historicalVerdict, 'unverified');

  const suite = { status: 'confirmatory', controls: { repetitions: { pilot: 1, confirmatory: 1 } } };
  const qualification = evaluateQualification({ suite, performedRepetitions: 1,
    sourceClean: true, verificationPassed: true, missions: [{ ...unverifiedEnd, lifecycle: 'verified' }] });
  assert.equal(qualification.confirmatoryEligible, false);
  assert.ok(qualification.blockers.includes('unverified-mission-marked-verified'));

  const current = require('./suite.json');
  assert.deepEqual(missingTopologyProbes(current.tasks), current.tasks
    .filter((task) => task.family === 'topology').map((task) => task.id),
  'all current topology rows remain blocked until mission probes and independent oracles exist');
  console.log('Topology readiness requires admissible mission-outcome evidence and an independent oracle: PASS');
}

run();
