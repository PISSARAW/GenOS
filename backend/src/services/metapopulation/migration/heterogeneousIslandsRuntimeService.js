'use strict';
const { isVersionedCulture, isCultural } = require('../migration/migrationPolicyService');

function checkDiversityConstraints(candidates, constraints, targetDeme) {
  const violations = [];
  for (const c of candidates) {
    violations.push(...candidateViolations(c, constraints));
  }
  return violations;
}

function candidateViolations(candidate, constraints) {
  return [
    ...providerViolations(candidate, constraints.providers),
    ...algorithmViolations(candidate, constraints.algorithms),
    ...lineageViolations(candidate, constraints.lineages)
  ];
}

function providerViolations(candidate, providers) {
  const provider = candidate.providerId || candidate.provider;
  if (providers && providers.size > 0 && provider && providers.has(provider)) {
    return [{ candidate: candidate.propaguleId, reason: 'PROVIDER_DUPLICATE' }];
  }
  return [];
}

function algorithmViolations(candidate, algorithms) {
  const algo = candidate.algorithmId || candidate.solverId;
  if (algorithms && algorithms.size > 0 && algo && algorithms.has(algo)) {
    return [{ candidate: candidate.propaguleId, reason: 'ALGORITHM_DUPLICATE' }];
  }
  return [];
}

function lineageViolations(candidate, lineages) {
  const refs = candidate.lineageRefs || [];
  if (lineages && lineages.size > 0 && refs.some((ref) => lineages.has(ref))) {
    return [{ candidate: candidate.propaguleId, reason: 'LINEAGE_DUPLICATE' }];
  }
  return [];
}

function validateHeterogeneousReceiver(targetDeme, candidate) {
  if (!targetDeme) return { compatible: false, reason: 'TARGET_DEME_NOT_FOUND' };
  if (isCultural(candidate) && !isVersionedCulture(candidate)) {
    return { compatible: false, reason: 'CULTURE_NOT_VERSIONED' };
  }
  const targetProviders = new Set(targetDeme.capabilities || []);
  const candidateProvider = candidate.providerId || candidate.provider;
  if (candidateProvider && targetProviders.size > 0 && !targetProviders.has(candidateProvider)) {
    return { compatible: false, reason: 'PROVIDER_INCOMPATIBLE' };
  }
  return { compatible: true };
}

function antiHomogenizationMonitor(demes, migrationHistory, windowSize = 5) {
  const recent = migrationHistory.slice(-windowSize);
  const providerCounts = countBy(recent, (m) => m.providerId || m.provider);
  const algoCounts = countBy(recent, (m) => m.algorithmId || m.solverId);
  const total = recent.length || 1;
  const providerShare = maxShare(providerCounts, total);
  const algoShare = maxShare(algoCounts, total);
  return {
    homogenizationRisk: Math.max(providerShare, algoShare),
    dominantProvider: dominantKey(providerCounts),
    dominantAlgo: dominantKey(algoCounts),
    threshold: 0.6,
    actionable: providerShare >= 0.6 || algoShare >= 0.6,
  };
}

function countBy(migrations, keyOf) {
  const counts = new Map();
  for (const m of migrations) {
    const key = keyOf(m);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function maxShare(counts, total) {
  return Math.max(...counts.values(), 0) / total;
}

function dominantKey(counts) {
  if (!counts.size) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

module.exports = { checkDiversityConstraints, validateHeterogeneousReceiver, antiHomogenizationMonitor };
