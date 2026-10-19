'use strict';

const assert = require('assert');
const { SCHEMA } = require('../src/services/adapterEcology/adapterManifest');
const succession = require('../src/services/adapterEcology/consortiumSuccessionService');

function adapter(id, capabilities, lease) {
  return {
    schema: SCHEMA, adapterId: id, version: '1.0.0', providerKind: 'service', reference: `service://${id}`,
    capabilities, dataScopes: ['repo:alpha'], toolLeases: [lease], economics: { costUsd: 1, latencyMs: 100 },
    health: { status: 'HEALTHY', checkedAt: '2026-10-19T10:00:00.000Z', reliability: 0.95 },
    fitness: { evidenceQuality: 0.9, historicalCompatibility: 0.8, replaceability: 0.9,
      risk: 0.1, dependencyRisk: 0.2 }, attestationRefs: [`attestation:${id}`],
    compensation: { action: `${id}.detach`, evidenceRequirements: [`receipt:${id}:detached`] }
  };
}

function observation(id, overrides = {}) {
  return { adapterId: id, observedAt: '2026-10-19T10:00:20.000Z', status: 'AVAILABLE',
    latencyMs: 100, costUsd: 1, evidenceRefs: [`health:${id}`], ...overrides };
}

function policy() {
  return { now: '2026-10-19T10:00:30.000Z', maxObservationAgeMs: 30000,
    latencyTolerance: 2, costTolerance: 2 };
}

function testStableConsortium() {
  const active = [adapter('search', ['code.search'], 'search.run')];
  const result = succession.assessConsortium(active, [observation('search')], policy());
  assert.strictEqual(result.state, 'STABLE');
}

function testDysbiosisSuccessionAndCompensation() {
  const search = adapter('search', ['code.search'], 'search.run');
  const issues = adapter('issues', ['issue.write'], 'issues.run');
  const replacement = adapter('replacement', ['code.search'], 'replacement.run');
  const demand = { requiredCapabilities: ['code.search', 'issue.write'], allowedDataScopes: ['repo:alpha'],
    allowedToolLeases: ['search.run', 'issues.run', 'replacement.run'], maxCostUsd: 4, maxLatencyMs: 500,
    maxHealthAgeMs: 60000, now: policy().now, riskTolerance: 'LOW', maxDependencyPerSymbiont: 0.5 };
  const result = succession.planSuccession({
    activeManifests: [search, issues], candidateManifests: [replacement], demand, policy: policy(),
    observations: [observation('search', { status: 'FAILED' }), observation('issues')]
  });
  assert.strictEqual(result.status, 'succession_planned');
  assert.deepStrictEqual(result.quarantinedAdapterIds, ['search']);
  assert.deepStrictEqual(result.replacement.adapterIds, ['issues', 'replacement']);
  assert.deepStrictEqual(result.holobiontSuccession.admittedSymbiontIds, ['replacement']);
  assert.strictEqual(result.compensationPlan[0].action, 'search.detach');

  const blocked = succession.authorizeCompensation(result.compensationPlan, { search: [] });
  assert.strictEqual(blocked.authorized, false);
  const authorized = succession.authorizeCompensation(result.compensationPlan,
    { search: ['receipt:search:detached'] });
  assert.strictEqual(authorized.authorized, true);
}

function testMissingEvidenceTriggersDysbiosis() {
  const active = [adapter('search', ['code.search'], 'search.run')];
  const result = succession.assessConsortium(active, [observation('search', { evidenceRefs: [] })], policy());
  assert.deepStrictEqual(result.assessments[0].symptoms, ['EVIDENCE_MISSING']);
}

testStableConsortium();
testDysbiosisSuccessionAndCompensation();
testMissingEvidenceTriggersDysbiosis();
console.log('Adapter consortium succession tests passed.');
