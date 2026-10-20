'use strict';

const assert = require('node:assert/strict');
const useCases = require('../src/services/morphogenesis/registry/variantUseCaseSelector');
const profiles = require('../src/services/morphogenesis/registry/topologyProfileService');

function defaultVariant(topology) {
  return {
    topology,
    variantId: 'default',
    parameters: {},
    maturity: 'stable'
  };
}

function main() {
  const originalSelect = useCases.selectVariant;
  useCases.selectVariant = () => ({
    variantId: 'missing-specialization', method: 'mission_signals', confidence: 0.8,
    reasons: ['SPECIALIZED_SIGNAL']
  });
  const registry = {
    list: () => ['default'],
    resolve: (topology, variantId) => variantId === 'default' ? defaultVariant(topology) : null
  };

  try {
    const result = profiles.resolveRequestedProfile({ mission: 'Use a missing specialization.' },
      'trinity', registry);
    const selection = result.variantSelection;
    assert.equal(selection.variantId, 'default');
    assert.equal(selection.requestedVariantId, 'missing-specialization');
    assert.equal(selection.actualVariantId, 'default');
    assert.equal(selection.substituted, true);
    assert.equal(selection.fallback, true);
    assert.equal(selection.fallbackApplied, true);
    assert.equal(selection.fallbackReason, 'SELECTED_VARIANT_UNAVAILABLE');
    assert.ok(selection.reasons.includes('SPECIALIZED_SIGNAL'));
    assert.ok(selection.reasons.includes('SELECTED_VARIANT_UNAVAILABLE'));
  } finally {
    useCases.selectVariant = originalSelect;
  }

  console.log('Topology variant fallback traceability: PASS');
}

main();
