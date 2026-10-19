'use strict';

const assert = require('assert');
const { SCHEMA } = require('../src/services/adapterEcology/adapterManifest');
const { selectConsortium } = require('../src/services/adapterEcology/minimalConsortiumService');

function adapter(id, capabilities, overrides = {}) {
  return {
    schema: SCHEMA, adapterId: id, version: '1.0.0', providerKind: 'tool',
    reference: `tool://${id}`, capabilities, dataScopes: ['repo:alpha'],
    toolLeases: [`${id}.execute`], economics: { costUsd: 1, latencyMs: 50 },
    health: { status: 'HEALTHY', checkedAt: '2026-10-19T10:00:00.000Z', reliability: 0.9 },
    fitness: { evidenceQuality: 0.9, historicalCompatibility: 0.8, replaceability: 0.8,
      risk: 0.1, dependencyRisk: 0.2 }, attestationRefs: [`attestation:${id}`],
    compensation: { action: `${id}.detach`, evidenceRequirements: ['receipt:detached'] }, ...overrides
  };
}

function demand(adapters, overrides = {}) {
  return {
    requiredCapabilities: ['code.search', 'issue.write'], allowedDataScopes: ['repo:alpha'],
    allowedToolLeases: adapters.map((item) => item.toolLeases[0]), maxCostUsd: 10,
    maxLatencyMs: 1000, maxHealthAgeMs: 60000, now: '2026-10-19T10:00:30.000Z',
    riskTolerance: 'LOW', maxDependencyPerSymbiont: 0.5, ...overrides
  };
}

function testSmallestConsortiumWins() {
  const pair = [adapter('search', ['code.search']), adapter('issues', ['issue.write'])];
  const complete = adapter('complete', ['code.search', 'issue.write'], {
    economics: { costUsd: 5, latencyMs: 200 }
  });
  const result = selectConsortium([...pair, complete], demand([...pair, complete]));
  assert.strictEqual(result.status, 'minimum_sufficient_consortium');
  assert.deepStrictEqual(result.adapterIds, ['complete']);
  assert.strictEqual(result.morphologyDecision.selected.level, 'direct_worker');
  assert.strictEqual(result.garageRequests.length, 1);
}

function testCombinationAndMorphogenesisProof() {
  const adapters = [adapter('search', ['code.search']), adapter('issues', ['issue.write'])];
  const result = selectConsortium(adapters, demand(adapters));
  assert.deepStrictEqual(result.adapterIds, ['issues', 'search']);
  assert.strictEqual(result.metrics.adapterCount, 2);
  assert.strictEqual(result.morphologyDecision.valid, true);
  assert.strictEqual(result.morphologyDecision.selected.level, 'ecology');
  assert.strictEqual(result.capabilityNodes.length, 2);
}

function testHealthAndLeaseExclusion() {
  const stale = adapter('stale', ['code.search', 'issue.write'], {
    health: { status: 'HEALTHY', checkedAt: '2026-10-19T09:00:00.000Z', reliability: 1 }
  });
  const denied = adapter('denied', ['code.search', 'issue.write'], { toolLeases: ['admin.*'] });
  const result = selectConsortium([stale, denied], demand([stale], { allowedToolLeases: ['stale.execute'] }));
  assert.strictEqual(result.status, 'no_admissible_consortium');
  assert.deepStrictEqual(result.rejections.map((item) => item.adapterId).sort(), ['denied', 'stale']);
  assert.ok(result.rejections.find((item) => item.adapterId === 'stale').reasons.includes('HEALTH_STALE'));
}

testSmallestConsortiumWins();
testCombinationAndMorphogenesisProof();
testHealthAndLeaseExclusion();
console.log('Adapter minimal consortium tests passed.');
