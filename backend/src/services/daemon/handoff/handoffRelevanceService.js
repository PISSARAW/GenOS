'use strict';

/**
 * Handoff Relevance — ADR 0034 D11.
 *
 * Le daemon ne récite pas tout ce qu'il sait : les findings sont
 * ordonnés pour la mission (statut épistémique d'abord, recouvrement
 * lexical mission/claim ensuite, plafonné). Déterministe, sans LLM.
 * Le feedback orchestrateur (D12) ajustera ces scores par plasticité.
 */

const STATUS_WEIGHT = {
  REPAIRABLE: 6,
  CAUSALLY_SUPPORTED: 5,
  REPRODUCED: 4,
  SUPPORTED: 3,
  HYPOTHESIZED: 2,
  OBSERVED: 1,
  STALE: 0.5
};

const RELEVANCE_THRESHOLDS = { high: 6, medium: 2, low: 0 };

function normalizeToken(token) {
  return String(token || '').toLowerCase().replace(/s$/, '');
}

function tokensOf(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2).map(normalizeToken);
}

function missionOverlap(finding, mission) {
  if (!mission) return 0;
  const missionTokens = new Set(tokensOf(mission));
  if (missionTokens.size === 0) return 0;
  const haystack = `${finding.claim || ''} ${finding.scope_value || ''} ${finding.detector_id || ''}`;
  const hits = tokensOf(haystack).filter((t) => missionTokens.has(t)).length;
  return Math.min(3, hits);
}

function scoreFinding(finding, args) {
  const base = STATUS_WEIGHT[finding.status] || 0;
  return Number((base + missionOverlap(finding, args && args.mission)).toFixed(3));
}

function rankFindings(findings, args) {
  const scored = (findings || []).map((finding) => ({ finding, score: scoreFinding(finding, args) }));
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function relevanceClass(ranked, thresholds) {
  const top = (ranked || [])[0];
  const t = thresholds || RELEVANCE_THRESHOLDS;
  if (!top) return 'low';
  if (top.score >= t.high) return 'high';
  if (top.score >= t.medium) return 'medium';
  return 'low';
}

module.exports = { STATUS_WEIGHT, RELEVANCE_THRESHOLDS, scoreFinding, rankFindings, relevanceClass };
