'use strict';

const { createNiche } = require('../contracts/niche');
const { qualifiesForOpening } = require('./nicheOpportunityService');

function discoverNiches(input = {}) {
  const known = new Map((input.existingNiches || []).map((niche) => [niche.nicheId, niche]));
  const candidates = opportunityCandidates(input.opportunityMap || []);
  candidates.push(...failureCandidates(input.failureClusters || []));
  return candidates.map((candidate) => mergeCandidate(candidate, known.get(candidate.nicheId)));
}

function opportunityCandidates(opportunities) {
  return opportunities.filter((item) => item.status === 'candidate').map((item) => createNiche({
    nicheId: `niche-${stableId(item.opportunityId)}`,
    opportunityId: item.opportunityId,
    descriptor: item.descriptor,
    requiredCapabilities: item.requiredCapabilities,
    resourceProfile: item.resourceProfile,
    opportunityScore: item.opportunityScore,
    novelty: item.novelty,
    evidenceRefs: item.evidenceRefs,
    justifiedUncertainty: item.justifiedUncertainty,
    entryConditions: [{ evidenceRequired: true }]
  }));
}

function failureCandidates(clusters) {
  return clusters.filter(isSupportedFailure).map((cluster) => createNiche({
    nicheId: `niche-failure-${stableId(cluster.clusterId)}`,
    descriptor: cluster.descriptor || `Repeated failure cluster ${cluster.clusterId}`,
    opportunityScore: bounded(cluster.opportunityScore, 0.5),
    evidenceRefs: cluster.evidenceRefs,
    sourceSignals: cluster.signalIds,
    justifiedUncertainty: cluster.justifiedUncertainty,
    entryConditions: [{ repeatedFailures: cluster.occurrences }]
  }));
}

function isSupportedFailure(cluster) {
  return Number(cluster.occurrences) >= 2
    && ((Array.isArray(cluster.evidenceRefs) && cluster.evidenceRefs.length > 0) || Number(cluster.justifiedUncertainty) >= 0.75);
}

function mergeCandidate(candidate, existing) {
  if (!existing) return candidate;
  return createNiche({ ...candidate, ...existing, evidenceRefs: [...new Set([...candidate.evidenceRefs, ...existing.evidenceRefs])] });
}

function stableId(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
}

function bounded(value, fallback) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : fallback;
}

module.exports = { discoverNiches };
