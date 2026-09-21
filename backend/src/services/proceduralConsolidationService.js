'use strict';

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const genomePolicy = require('./proceduralGenomePolicyService');

function episodeFrom(input = {}) {
  return {
    id: input.id || `ep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    trajectory: Array.isArray(input.trajectory) ? input.trajectory : [],
    outcome: input.outcome || null,
    success: Boolean(input.outcome === 'success' || input.success),
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

function lcsTwo(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  let i = m, j = n;
  const result = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return result;
}

function lcsMultiple(serials) {
  if (!serials || serials.length < 2) return [];
  let common = serials[0] || [];
  for (let i = 1; i < serials.length; i++) {
    common = lcsTwo(common, serials[i] || []);
    if (!common.length) break;
  }
  return common;
}

function extractCommonSubpath(episodes) {
  if (!Array.isArray(episodes) || episodes.length < 2) return [];
  const serials = toSerials(episodes);
  return lcsMultiple(serials);
}

function episodesForContext(episodes, contextFilter = {}) {
  if (!Array.isArray(episodes)) return [];
  const f = contextFilter || {};
  return episodes.filter((e) => {
    if (f.context != null && typeof f.context === 'object') {
      for (const k of Object.keys(f.context)) {
        if (String(e.context?.[k] ?? '') !== String(f.context[k])) return false;
      }
    }
    if (f.outcome != null && String(e.outcome) !== String(f.outcome)) return false;
    return true;
  });
}

function transitionFrequency(episodes) {
  const freq = {};
  for (const ep of episodes) {
    const traj = ep.trajectory || [];
    for (let i = 0; i < traj.length - 1; i++) {
      const key = `${traj[i]}->${traj[i + 1]}`;
      freq[key] = freq[key] || { success: 0, failure: 0 };
      if (ep.success) freq[key].success++;
      else freq[key].failure++;
    }
  }
  return freq;
}

function contrastTransitions(successEpisodes, failureEpisodes) {
  const successFreq = transitionFrequency(successEpisodes);
  const failureFreq = transitionFrequency(failureEpisodes);
  const allKeys = new Set([...Object.keys(successFreq), ...Object.keys(failureFreq)]);
  const scored = [];
  for (const key of allKeys) {
    const s = successFreq[key]?.success || 0;
    const f = failureFreq[key]?.failure || 0;
    const totalS = successEpisodes.length || 1;
    const totalF = failureEpisodes.length || 1;
    const pGivenSuccess = s / totalS;
    const pGivenFailure = f / totalF;
    scored.push({ key, pGivenSuccess, pGivenFailure, contrast: pGivenSuccess - pGivenFailure, total: s + f });
  }
  scored.sort((a, b) => b.contrast - a.contrast);
  return scored;
}

function consolidatePath(policy, episodes) {
  const p = genomePolicy.policyFrom(policy);
  const relevant = episodesForContext(episodes, {});
  if (relevant.length < p.consolidation.minEpisodes) {
    return { consolidated: false, reason: 'insufficient_episodes', count: relevant.length };
  }
  const common = extractCommonSubpath(relevant);
  if (!common.length) {
    return { consolidated: false, reason: 'no_common_subpath', count: relevant.length };
  }
  const successEpisodes = relevant.filter((e) => e.success);
  const failureEpisodes = relevant.filter((e) => !e.success);
  const successRate = successEpisodes.length / relevant.length;
  if (successRate < genomePolicy.consolidationThreshold(p)) {
    return { consolidated: false, reason: 'below_threshold', successRate };
  }
  const transitions = contrastTransitions(successEpisodes, failureEpisodes);
  const goldenPath = {
    id: `gp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    path: common,
    provenance: {
      episodeCount: relevant.length,
      successCount: successEpisodes.length,
      failureCount: failureEpisodes.length,
      successRate: clamp01(successRate),
      observedAt: new Date().toISOString(),
      contexts: [...new Set(relevant.map((e) => JSON.stringify(e.context || {})))],
    },
    transitionContrast: transitions.slice(0, 5),
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
  transitionFrequency,
  contrastTransitions,
  lcsMultiple,
};
