'use strict';

const assert = require('assert');
const variants = require('../src/services/holobionte/variants');

function testVariantSurface() {
  assert.deepStrictEqual(variants.names, [
    'organelle', 'adaptiveMicrobiome', 'immuneCritical', 'localFirst', 'regenerative',
    'cloudCoreEdge', 'edgeCoreCloud', 'memoryRich', 'competitivePartner', 'procedural', 'tool', 'cloudCoreEdgeSync'
  ]);
  for (const name of variants.names) {
    const policy = variants.getVariant(name);
    for (const method of [
      'configureHost', 'configureAdmission', 'configureResources',
      'configureImmunePolicy', 'configureTransmission', 'configureSuccession', 'configureStopConditions',
      'configurePlacement', 'configureMemory', 'configureCompetition', 'configureTool', 'configureSynchronization'
    ]) {
      assert.ok(policy[method]());
    }
    const fit = policy.analyzeFit({ capabilities: [
      'stable-core', 'diversity', 'cloud-core', 'edge-symbionts', 'cloud-proxy',
      'persistent-memory', 'verified-trials', 'tool-sandbox', 'edge-sync', 'provenance-verification'
    ],
      localEngineAvailable: true, immunePlaneAvailable: true, successionAvailable: true });
    assert.strictEqual(fit.compatible, true);
    assert.strictEqual(fit.score, 1);
  }
}

function testExtendedVariantContracts() {
  assert.equal(variants.getVariant('cloud-core/edge-symbionts').configureAdmission().requireEdgeLease, true);
  assert.equal(variants.getVariant('edge-core/cloud-symbionts').configureAdmission().redactRemoteInputs, true);
  assert.deepEqual(variants.getVariant('memory-rich').configureMemory().stores, ['semantic', 'episodic', 'procedural']);
  assert.equal(variants.getVariant('competitive-partner').configureCompetition().trialMode, 'same-budget');
  assert.equal(variants.getVariant('procedural').configureHost().capabilityGapResponse, 'contracted-recruitment');
  assert.equal(variants.getVariant('tool').configureTool().sandbox, 'contract-bound');
  assert.equal(variants.getVariant('cloud-core/edge-sync').configureSynchronization().staleState, 'reject');
}

function testFitAndIsolation() {
  const localFirst = variants.getVariant('localFirst');
  assert.deepStrictEqual(localFirst.analyzeFit({ localEngineAvailable: false }).reasons, ['local-engine']);
  const hostConfig = localFirst.configureHost();
  hostConfig.preferredEngine = 'cloud';
  assert.strictEqual(localFirst.configureHost().preferredEngine, 'local');
  assert.throws(() => variants.getVariant('unknown'), { code: 'HOLOBIONT_VARIANT_UNKNOWN' });
}

testVariantSurface();
testFitAndIsolation();
testExtendedVariantContracts();
console.log('✅ Holobiont variant policy tests passed.');
