'use strict';

const curiosityExplorer = require('../src/services/curiosityExplorerService');

function makeTestDomains() {
  return [
    { domainId: 'empty-room', seenCount: 40, errorHistory: [0.9, 0.88, 0.87, 0.87, 0.87], knownAffordanceCount: 10, testedAffordanceCount: 10, totalAffordanceCount: 10, predictionVariance: 0.02 },
    { domainId: 'noisy-tv', seenCount: 2, errorHistory: [0.9, 0.95, 0.9, 0.98, 0.92], knownAffordanceCount: 0, testedAffordanceCount: 0, totalAffordanceCount: 20, predictionVariance: 0.95 },
    { domainId: 'learnable-puzzle', seenCount: 3, errorHistory: [0.9, 0.7, 0.55, 0.4, 0.3], knownAffordanceCount: 1, testedAffordanceCount: 1, totalAffordanceCount: 12, predictionVariance: 0.4 },
  ];
}

function buildAgentContext(tokens = 1000, risk = 0) {
  return { availableTokens: tokens, risk };
}

describe('curiosityExplorerService', () => {
  test('selects learnable domain over mastered and noisy', () => {
    const domains = makeTestDomains();
    const selection = curiosityExplorer.selectCuriousDomain(domains, buildAgentContext());
    expect(selection).not.toBeNull();
    expect(selection.selectedDomainId).toBe('learnable-puzzle');
    expect(selection.curiosityScore).toBeGreaterThan(0);
  });

  test('ranks noisy domain below learnable despite high variance', () => {
    const domains = makeTestDomains();
    const ranked = curiosityExplorer.selectCuriousDomain(domains, buildAgentContext(), { weights: { novelty: 0.05, informationGain: 0.05, learningProgress: 0.8, affordanceUncertainty: 0.05, cost: 0.05, risk: 0.0 } });
    expect(ranked).not.toBeNull();
    expect(ranked.selectedDomainId).toBe('learnable-puzzle');
  });

  test('afterObservation updates seenCount and records error', () => {
    const before = { seenCount: 2, errorHistory: [0.5] };
    const after = curiosityExplorer.afterObservation(before, { predictionError: 0.3 });
    expect(after.seenCount).toBe(3);
    expect(after.errorHistory).toEqual([0.5, 0.3]);
  });

  test('returns null for empty domain list', () => {
    const result = curiosityExplorer.selectCuriousDomain([], buildAgentContext());
    expect(result).toBeNull();
  });
});
