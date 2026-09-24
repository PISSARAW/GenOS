'use strict';

const assert = require('assert');
const variants = require('../src/services/holobionte/variants');

function testVariantSurface() {
  assert.deepStrictEqual(variants.names, [
    'organelle', 'adaptiveMicrobiome', 'immuneCritical', 'localFirst', 'regenerative'
  ]);
  for (const name of variants.names) {
    const policy = variants.getVariant(name);
    for (const method of [
      'configureHost', 'configureAdmission', 'configureResources',
      'configureImmunePolicy', 'configureTransmission', 'configureSuccession', 'configureStopConditions'
    ]) {
      assert.ok(policy[method]());
    }
    const fit = policy.analyzeFit({ capabilities: ['stable-core', 'diversity'],
      localEngineAvailable: true, immunePlaneAvailable: true, successionAvailable: true });
    assert.strictEqual(fit.compatible, true);
    assert.strictEqual(fit.score, 1);
  }
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
console.log('✅ Holobiont variant policy tests passed.');
