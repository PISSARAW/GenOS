'use strict';

const assert = require('node:assert/strict');
const detector = require('../src/services/rhizome/boundary/boundaryDetector');

function baseSession() {
  return { rhizomeId: 'r', missionId: 'm', graphVersion: 4, nodes: [], edges: [], coordinationLoci: [] };
}

function node(nodeId, capabilities) {
  return { nodeId, kind: 'TOOL', capabilities, state: 'ACTIVE', evidenceRequirements: [] };
}

function need(evidenceRequirements = []) {
  return { needId: 'need-1', capability: 'rotate_token', evidenceRequirements, criticality: 0.8 };
}

function run() {
  const absent = detector.inspect(baseSession(), need());
  assert.equal(absent.gap.reason, 'CAPABILITY_ABSENT');
  assert.equal(absent.growthPermitted, true);

  const reachable = baseSession();
  reachable.nodes = [node('provider', ['rotate_token'])];
  assert.equal(detector.inspect(reachable, need()).reachable, true);

  const disconnected = baseSession();
  disconnected.nodes = [node('origin', []), node('provider', ['rotate_token'])];
  disconnected.coordinationLoci = [{ locusId: 'locus', holderNodeId: 'origin' }];
  const gap = detector.inspect(disconnected, need());
  assert.equal(gap.gap.reason, 'ROUTE_UNREACHABLE');
  assert.equal(gap.gap.currentFrontier.includes('origin'), true);
  assert.ok(gap.gap.evidence.evidenceId);

  disconnected.edges = [{ edgeId: 'route', from: 'origin', to: 'provider', relation: 'ROUTES_TO', status: 'ACTIVE' }];
  assert.equal(detector.inspect(disconnected, need()).reachable, true);

  const evidenceMismatch = baseSession();
  evidenceMismatch.nodes = [node('provider', ['rotate_token'])];
  const evidenceGap = detector.inspect(evidenceMismatch, need(['signed_test']));
  assert.equal(evidenceGap.gap.reason, 'EVIDENCE_UNSATISFIED');
  assert.equal(evidenceGap.growthPermitted, true);
}

run();
console.log('Rhizome boundary tests passed.');
