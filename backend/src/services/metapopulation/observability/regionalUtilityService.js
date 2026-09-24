'use strict';

const contributionService = require('./regionalContributionService');

function evaluateRegionalUtility(input = {}) {
  const demes = Array.isArray(input.demes) ? input.demes : [];
  const corridors = Array.isArray(input.corridors) ? input.corridors : [];
  const contributions = contributionService.analyzeContribution(demes, corridors, input.options || {});
  return { capacity: calculateCapacity(demes, corridors), contributions,
    migrations: (Array.isArray(input.migrations) ? input.migrations : []).map(evaluateMigrationValue),
    scope: 'regional_observation' };
}

function evaluateMigrationValue(migration) {
  const benefit = measure(migration.expectedReceiverGain) + measure(migration.rescueValue) + measure(migration.noveltyValue);
  const cost = measure(migration.transferCost) + measure(migration.assimilationRisk) + measure(migration.homogenizationRisk);
  const criticalRescue = migration.criticalRescue === true;
  return { migrationId: migration.migrationId || null, benefit: round(benefit), cost: round(cost),
    netUtility: round(benefit - cost), worthwhile: benefit > cost || criticalRescue,
    criticalRescue, reason: criticalRescue ? 'CRITICAL_RESCUE' : benefit > cost ? 'POSITIVE_NET_UTILITY' : 'COST_EXCEEDS_BENEFIT' };
}

function calculateCapacity(demes, corridors) {
  const nodes = demes.filter((deme) => !['COLLAPSED', 'QUARANTINED', 'DORMANT'].includes(deme.status));
  if (!nodes.length) return { value: 0, iterations: 0, converged: true, demeIds: [] };
  const matrix = buildMatrix(nodes, corridors);
  let vector = nodes.map(() => 1 / nodes.length);
  let estimate = 0;
  let converged = false;
  for (let iteration = 1; iteration <= 80; iteration += 1) {
    const next = matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
    const norm = next.reduce((sum, value) => sum + value, 0);
    if (!norm) return { value: 0, iterations: iteration, converged: true, demeIds: nodes.map((deme) => deme.demeId) };
    const delta = Math.abs(norm - estimate);
    vector = next.map((value) => value / norm);
    estimate = norm;
    if (delta < 0.00001) { converged = true; return capacityResult({ value: estimate, iterations: iteration, converged, nodes }); }
  }
  return capacityResult({ value: estimate, iterations: 80, converged, nodes });
}

function buildMatrix(nodes, corridors) {
  return nodes.map((source) => nodes.map((target) => {
    if (source.demeId === target.demeId) return 0;
    const edge = corridors.find((item) => item.enabled !== false && item.sourceDemeId === source.demeId && item.targetDemeId === target.demeId);
    if (!edge || target.patchAvailable === false) return 0;
    return measure(source.patchQuality ?? source.quality) * measure(edge.weight) * measure(edge.compatibility) * measure(target.patchAvailability ?? 1);
  }));
}

function capacityResult(input) {
  return { value: round(input.value), iterations: input.iterations, converged: input.converged,
    demeIds: input.nodes.map((deme) => deme.demeId) };
}
function measure(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function round(value) { return Number(value.toFixed(4)); }

module.exports = { evaluateRegionalUtility, evaluateMigrationValue, calculateCapacity };
