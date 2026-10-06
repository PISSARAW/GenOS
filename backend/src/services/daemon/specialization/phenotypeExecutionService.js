'use strict';

const registry = require('../investigation/anomalyDetectorRegistry');
const signals = require('../investigation/ecologicalDetectors');

const DETECTORS = Object.freeze({
  security: ['secret-exposure'],
  contract: ['broken-import', 'contract-drift'],
  dependency: ['broken-import'],
  documentation: ['missing-sibling-test', 'stale-documentation'],
  historian: ['repeated-failure', 'flaky-signal'],
  chaperone: ['unintegrated-component', 'missing-sibling-test'],
  metabolic: ['resource-anomaly'],
  cross_repo: ['cross-repo-drift', 'contract-drift'],
  repair: ['test-regression'],
  deep_research: ['knowledge-gap', 'stale-documentation']
});

function selectDetectors(families = []) {
  const focus = new Set(families.flatMap((family) => DETECTORS[family] || []));
  const all = [...registry.allDetectors(), ...signals.detectors()];
  return all.sort((left, right) => Number(focus.has(right.id)) - Number(focus.has(left.id)));
}

module.exports = { DETECTORS, selectDetectors };
