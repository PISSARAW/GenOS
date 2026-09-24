'use strict';

function analyzeContribution(demes, corridors = [], options = {}) {
  const populations = Array.isArray(demes) ? demes : [];
  const enabled = corridors.filter((edge) => edge.enabled !== false);
  const viable = populations.filter(isViable);
  const coverage = capabilityCoverage(viable);
  const regions = populations.map((deme) => describeDeme(deme, { viable, enabled, coverage, options }));
  return { demes: regions, uniqueCapabilities: [...coverage.keys()].filter((key) => coverage.get(key) === 1).sort(), sourceCount: countType(regions, 'SOURCE'), sinkCount: countType(regions, 'SINK') };
}

function capabilityCoverage(demes) {
  const counts = new Map();
  for (const deme of demes) for (const capability of capabilities(deme)) counts.set(capability, (counts.get(capability) || 0) + 1);
  return counts;
}

function describeDeme(deme, context) {
  const uniqueCapabilities = capabilities(deme).filter((item) => context.coverage.get(item) === 1).sort();
  const inbound = context.enabled.filter((edge) => edge.targetDemeId === deme.demeId).length;
  const outbound = context.enabled.filter((edge) => edge.sourceDemeId === deme.demeId).length;
  const fitness = metric(deme.fitness?.score ?? deme.fitness);
  const type = classifyDeme(deme, { ...context, inbound, outbound, fitness });
  return { demeId: deme.demeId, type, fitness, inbound, outbound,
    uniqueCapabilities, regionalContribution: uniqueCapabilities.length,
    protectedFromLocalCull: isProtected(uniqueCapabilities, fitness, context.options) };
}

function classifyDeme(deme, context) {
  if (isSource(deme, context)) return 'SOURCE';
  if (isSink(deme, context)) return 'SINK';
  return 'NEUTRAL';
}

function isSource(deme, context) {
  return context.viable.includes(deme) && context.outbound > context.inbound && context.fitness >= (context.options.sourceFitnessThreshold || 0.6);
}

function isSink(deme, context) {
  return context.inbound > context.outbound || (context.viable.includes(deme) && context.fitness < (context.options.sinkFitnessThreshold || 0.25));
}

function isProtected(uniqueCapabilities, fitness, options) {
  return uniqueCapabilities.length > 0 && fitness < (options.localCullFitnessThreshold || 0.2);
}

function capabilities(deme) {
  const supplied = deme.capabilities || deme.uniqueCapabilities || [];
  return [...new Set(Array.isArray(supplied) ? supplied.filter((item) => typeof item === 'string' && item.trim()) : [])];
}

function isViable(deme) {
  return !['COLLAPSED', 'QUARANTINED', 'DORMANT'].includes(deme.status) && deme.viable !== false;
}

function countType(demes, type) {
  return demes.filter((deme) => deme.type === type).length;
}

function metric(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
}

module.exports = { analyzeContribution, capabilityCoverage };
