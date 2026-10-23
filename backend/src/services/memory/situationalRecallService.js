'use strict';

const features = require('./situationFeatures');

const POLICY_VERSION = 'situational-recall-v1';
const MAX_SOURCE_ITEMS = 2048;
const CANDIDATE_LIMIT = 64;
const PROFILES = Object.freeze({
  exploration: { retrieval: 0.45, structure: 0.45, freshness: 0.05, traceability: 0.05, diversity: 0.15 },
  diagnosis: { retrieval: 0.3, structure: 0.55, freshness: 0.05, traceability: 0.1, diversity: 0 },
  verification: { retrieval: 0.2, structure: 0.45, freshness: 0.05, traceability: 0.3, diversity: 0 }
});

function unit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function eligible(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.id === 'signal_ignorance' || item.inhibitorySignal === 'active') return false;
  if (item.category === 'UnverifiedExperience') return false;
  return !features.memoryText(item).includes('[UNVERIFIED_EVIDENCE]');
}

function referenceTime(options) {
  const parsed = new Date(options.referenceTime ?? Date.now()).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function creationTime(timestamp) {
  const sqliteDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const value = sqliteDate.test(timestamp) ? timestamp.replace(' ', 'T') + 'Z' : timestamp;
  return new Date(value).getTime();
}

function freshness(item, now) {
  const timestamp = item.createdAt || item.created_at;
  if (!timestamp) return 0;
  const created = creationTime(timestamp);
  if (!Number.isFinite(created) || created > now) return 0;
  return Math.exp(-(now - created) / (30 * 86400000));
}

function traceability(item) {
  const refs = Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];
  const hasRef = refs.some((ref) => typeof ref === 'string' && ref.trim().length > 0);
  const hasProvenance = typeof item.provenance?.hash === 'string' && item.provenance.hash.trim().length > 0;
  // References permit inspection. Their presence does not authenticate a claim.
  return (Number(hasRef) + Number(hasProvenance)) / 2;
}

function describe(item, index, context) {
  const dimensions = features.encode(features.memoryText(item));
  const match = features.overlap(context.queryFeatures, dimensions);
  const retrieval = unit(item.similarityScore ?? item.similarity);
  return {
    item, index, dimensions, matched: match.matched,
    detection: (retrieval + match.score) / 2,
    criteria: { retrieval, structure: match.score, freshness: freshness(item, context.now), traceability: traceability(item) }
  };
}

function detectionCandidates(items, context) {
  const candidates = items.slice(0, MAX_SOURCE_ITEMS).filter(eligible)
    .map((item, index) => describe(item, index, context));
  candidates.sort((a, b) => b.detection - a.detection || a.index - b.index);
  const seen = new Set();
  return candidates.filter((entry) => {
    if (!entry.item.id) return true;
    if (seen.has(entry.item.id)) return false;
    seen.add(entry.item.id);
    return true;
  }).slice(0, CANDIDATE_LIMIT);
}

function discriminationScore(entry, profile) {
  return Object.keys(entry.criteria).reduce((score, key) => score + entry.criteria[key] * profile[key], 0);
}

function redundancy(entry, selected) {
  if (entry.dimensions.length === 0) return 0;
  return selected.reduce((highest, other) =>
    Math.max(highest, features.overlap(entry.dimensions, other.dimensions).score), 0);
}

function nextCandidate(remaining, selected, profile) {
  return remaining.map((entry) => ({
    ...entry,
    redundancy: profile.diversity * redundancy(entry, selected),
    score: discriminationScore(entry, profile) - profile.diversity * redundancy(entry, selected)
  })).sort((a, b) => b.score - a.score || a.index - b.index)[0];
}

function rankedItem(entry, context, rank) {
  const score = Number(unit(entry.score).toFixed(6));
  return {
    ...entry.item,
    recallScore: score,
    recall: {
      policy: POLICY_VERSION, phase: context.phase, rank, score,
      detectionScore: Number(entry.detection.toFixed(6)),
      matchedDimensions: entry.matched,
      criteria: entry.criteria,
      diversityPenalty: entry.redundancy,
      interpretation: 'ranking-only'
    }
  };
}

function rankMemories(query, items, options = {}) {
  const source = Array.isArray(items) ? items : [];
  if (options.situationalRecall === false) return source.filter(eligible);
  const context = { queryFeatures: features.encode(query), phase: features.resolvePhase(query, options), now: referenceTime(options) };
  const profile = PROFILES[context.phase];
  const remaining = detectionCandidates(source, context);
  const selected = [];
  while (remaining.length > 0) {
    const next = nextCandidate(remaining, selected, profile);
    selected.push(next);
    remaining.splice(remaining.findIndex((entry) => entry.index === next.index), 1);
  }
  return selected.map((entry, index) => rankedItem(entry, context, index + 1));
}

module.exports = { POLICY_VERSION, CANDIDATE_LIMIT, MAX_SOURCE_ITEMS, rankMemories };
