'use strict';

function candidateDomain(candidate) {
  return candidate.epistemicContext?.domain || candidate.source?.module || 'unknown';
}

function marketKey(candidate, topology) {
  const assignedRegion = topology?.partitionByModule?.[candidate.source?.module];
  if (assignedRegion) return `region:${assignedRegion}`;
  const mode = topology?.marketMode || topology?.name || 'domain';
  if (mode === 'syncytium') return 'shared';
  if (mode === 'trinity') return `world:${candidate.epistemicContext?.worldId || candidateDomain(candidate)}`;
  if (mode === 'biome') return `niche:${candidate.epistemicContext?.niche || candidateDomain(candidate)}`;
  if (mode === 'rhizome') return `region:${candidate.epistemicContext?.regionId || candidateDomain(candidate)}`;
  if (mode === 'a_team') return `domain:${candidateDomain(candidate)}`;
  return `domain:${candidateDomain(candidate)}`;
}

function partition(options) {
  const groups = new Map();
  for (const candidate of options.candidates || []) {
    const key = marketKey(candidate, options.topology);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  return [...groups].map(([marketId, candidates]) => ({ marketId, candidates }));
}

module.exports = { partition, marketKey, candidateDomain };
