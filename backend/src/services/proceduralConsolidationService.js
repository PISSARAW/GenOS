"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}
const genomePolicy = require("./proceduralGenomePolicyService");

function episodeFrom(input = {}) {
  return {
    id: input.id || `ep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    trajectory: Array.isArray(input.trajectory) ? input.trajectory : [],
    outcome: input.outcome || null,
    success: Boolean(input.outcome === "success" || input.success),
    context: input.context || {},
    observedAt: input.observedAt || new Date().toISOString(),
    structuralNodes: input.structuralNodes || [],
  };
}

function toSerials(episodes) {
  return episodes.map((e) =>
    Array.isArray(e.trajectory) ? e.trajectory.map(String) : []
  );
}

function commonPrefixFrom(serials) {
  let common = serials[0] ? [...serials[0]] : [];
  for (let i = 1; i < serials.length; i++) {
    const other = serials[i] || [];
    const len = Math.min(common.length, other.length);
    let j = 0;
    while (j < len && common[j] === other[j]) j++;
    common = common.slice(0, j);
    if (!common.length) break;
  }
  return common;
}

function extractCommonSubpath(episodes) {
  if (!Array.isArray(episodes) || episodes.length < 2) return [];
  const serials = toSerials(episodes);
  return serials.length ? commonPrefixFrom(serials) : [];
}

function episodesForContext(episodes, contextFilter = {}) {
  if (!Array.isArray(episodes)) return [];
  const f = contextFilter || {};
  return episodes.filter((e) => {
    if (f.context != null && typeof f.context === "object") {
      for (const k of Object.keys(f.context)) {
        if (String(e.context?.[k] ?? "") !== String(f.context[k])) return false;
      }
    }
    if (f.outcome != null && String(e.outcome) !== String(f.outcome)) return false;
    return true;
  });
}

function consolidatePath(policy, episodes) {
  const p = genomePolicy.policyFrom(policy);
  const relevant = episodesForContext(episodes, {});
  if (relevant.length < p.consolidation.minEpisodes) {
    return { consolidated: false, reason: "insufficient_episodes", count: relevant.length };
  }
  const common = extractCommonSubpath(relevant);
  if (!common.length) {
    return { consolidated: false, reason: "no_common_subpath", count: relevant.length };
  }
  const successRate = relevant.reduce((acc, e) => acc + (e.success ? 1 : 0), 0) / relevant.length;
  if (successRate < genomePolicy.consolidationThreshold(p)) {
    return { consolidated: false, reason: "below_threshold", successRate };
  }
  const goldenPath = {
    id: `gp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    path: common,
    provenance: {
      episodeCount: relevant.length,
      successRate: clamp01(successRate),
      observedAt: new Date().toISOString(),
      contexts: [...new Set(relevant.map((e) => JSON.stringify(e.context || {}))) ],
    },
    consolidated: true,
    consolidatedAt: new Date().toISOString(),
  };
  return goldenPath;
}

function replaySummary(episodes) {
  if (!Array.isArray(episodes) || !episodes.length) {
    return { replayed: 0, successCount: 0, failureCount: 0, successRate: 0 };
  }
  const successCount = episodes.filter((e) => e.success).length;
  const failureCount = episodes.length - successCount;
  return {
    replayed: episodes.length,
    successCount,
    failureCount,
    successRate: clamp01(successCount / episodes.length),
  };
}

module.exports = {
  episodeFrom,
  extractCommonSubpath,
  episodesForContext,
  consolidatePath,
  replaySummary,
};
