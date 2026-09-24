'use strict';
const { PROPAGULE_TYPES } = require('../constants');

const POLICIES = Object.freeze(['elite', 'novelty', 'rescue', 'complementary', 'counterexample', 'cultural', 'founder']);
const SCORERS = {
  elite: (candidate) => metric(candidate.sourceFitness),
  novelty: (candidate) => metric(candidate.novelty),
  rescue: (candidate) => metric(candidate.compatibility) * (1 - metric(candidate.targetFitness)),
  complementary: (candidate) => metric(candidate.complementarity),
  counterexample: (candidate) => hasCounterexample(candidate) ? metric(candidate.novelty) + metric(candidate.sourceFitness) : -1,
  cultural: (candidate) => isCultural(candidate) ? Math.max(metric(candidate.novelty), metric(candidate.sourceFitness)) : -1,
  founder: (candidate) => metric(candidate.sourceFitness) * 0.6 + metric(candidate.novelty) * 0.4
};

function selectCandidates(candidates, options = {}) {
  const policy = options.policy || 'elite';
  if (!POLICIES.includes(policy)) throw Object.assign(new Error('Unsupported migration selection policy.'), { code: 'METAPOPULATION_MIGRATION_POLICY_INVALID' });
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => matchesRequest(candidate, options))
    .map((candidate) => ({ candidate, score: SCORERS[policy](candidate) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score || left.candidate.propaguleId.localeCompare(right.candidate.propaguleId));
  const limit = normalizeLimit(options.limit);
  if (policy === 'founder') return selectFounderSet(ranked, limit);
  return ranked.slice(0, limit).map((entry) => selected(entry, policy, entry.score));
}

function selectFounderSet(ranked, limit) {
  const remaining = [...ranked];
  const selectedEntries = [];
  const lineages = new Set();
  while (remaining.length && selectedEntries.length < limit) {
    remaining.sort((left, right) => founderScore(right, lineages) - founderScore(left, lineages));
    const next = remaining.shift();
    selectedEntries.push(selected(next, 'founder', founderScore(next, lineages)));
    for (const lineage of next.candidate.lineageRefs || []) lineages.add(lineage);
  }
  return selectedEntries;
}

function founderScore(entry, lineages) {
  const refs = Array.isArray(entry.candidate.lineageRefs) ? entry.candidate.lineageRefs : [];
  const novelCount = refs.filter((lineage) => !lineages.has(lineage)).length;
  return entry.score + novelCount / Math.max(1, refs.length) * 0.25;
}

function selected(entry, policy, score) {
  return { ...entry.candidate, selectionPolicy: policy, selectionScore: Number(score.toFixed(4)) };
}

function planPush(input) {
  const targets = uniqueTargets(input.targetDemeIds);
  const perTarget = {};
  for (const targetDemeId of targets) {
    perTarget[targetDemeId] = selectCandidates(input.candidates, {
      policy: input.policy, limit: input.limitPerTarget, sourceDemeId: input.sourceDemeId, targetDemeId
    });
  }
  return { direction: 'push', sourceDemeId: input.sourceDemeId, policy: input.policy || 'elite', perTarget };
}

function queryPull(input) {
  if (!input.targetDemeId) throw Object.assign(new Error('A target deme is required for a pull query.'), { code: 'METAPOPULATION_PULL_TARGET_REQUIRED' });
  const candidates = selectCandidates(input.candidates, {
    policy: input.policy || 'novelty', limit: input.limit, targetDemeId: input.targetDemeId,
    sourceDemeId: input.sourceDemeId, types: input.types, minNovelty: input.minNovelty,
    minFitness: input.minFitness, excludeLineages: input.excludeLineages
  });
  return { direction: 'pull', targetDemeId: input.targetDemeId, requestedFrom: input.sourceDemeId || null, policy: input.policy || 'novelty', candidates };
}

function matchesRequest(candidate, request) {
  if (!candidate?.propaguleId || !PROPAGULE_TYPES.includes(candidate.type)) return false;
  return matchesEndpoints(candidate, request) && matchesType(candidate, request) &&
    meetsThresholds(candidate, request) && sharesNoExcludedLineage(candidate.lineageRefs, request.excludeLineages);
}

function matchesEndpoints(candidate, request) {
  const sourceMatches = !request.sourceDemeId || candidate.sourceDemeId === request.sourceDemeId;
  const targetMatches = !request.targetDemeId || candidate.targetDemeId === request.targetDemeId;
  return sourceMatches && targetMatches;
}

function matchesType(candidate, request) {
  return !Array.isArray(request.types) || request.types.includes(candidate.type);
}

function meetsThresholds(candidate, request) {
  return metric(candidate.novelty) >= metric(request.minNovelty) &&
    metric(candidate.sourceFitness) >= metric(request.minFitness);
}

function sharesNoExcludedLineage(lineages = [], excluded = []) {
  if (!Array.isArray(excluded) || !excluded.length) return true;
  const blocked = new Set(excluded);
  return !lineages.some((lineage) => blocked.has(lineage));
}

function uniqueTargets(targets) {
  if (!Array.isArray(targets) || !targets.length || targets.some((target) => typeof target !== 'string' || !target.trim())) {
    throw Object.assign(new Error('Push requires at least one target deme.'), { code: 'METAPOPULATION_PUSH_TARGETS_INVALID' });
  }
  return [...new Set(targets)];
}

function hasCounterexample(candidate) {
  return candidate.type === 'COUNTEREXAMPLE' || (Array.isArray(candidate.sourceEvidence) && candidate.sourceEvidence.some((evidence) => evidence?.kind === 'COUNTEREXAMPLE'));
}

function isCultural(candidate) {
  return ['COGNITIVE_RECIPE', 'PROCEDURE', 'MEMORY_FRAGMENT', 'STRATEGY'].includes(candidate.type);
}

function normalizeLimit(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : Number.MAX_SAFE_INTEGER;
}

function metric(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

module.exports = { selectCandidates, planPush, queryPull, POLICIES };
