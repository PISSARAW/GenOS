'use strict';

const { describeExpression, structuralSimilarity } = require('./morphologyCandidate');

const DEFAULT_LIMIT = 12;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function candidateQuality(candidate) {
  const quality = Number(candidate?.score?.total);
  return Number.isFinite(quality) ? clamp01(quality) : null;
}

function descriptorFor(candidate) {
  return candidate.descriptor || describeExpression(candidate.expression || candidate.morphology);
}

function topologyKey(descriptor) {
  const values = Array.isArray(descriptor.topologies) ? descriptor.topologies : [];
  return values.length ? [...new Set(values)].sort().join('+') : 'no-topology';
}

function band(value, width) {
  const number = Math.max(0, Number(value) || 0);
  return Math.floor(number / width);
}

function nicheFor(candidate, options = {}) {
  const descriptor = descriptorFor(candidate);
  const nodeWidth = positiveInteger(options.nodeBandWidth, 2);
  const depthWidth = positiveInteger(options.depthBandWidth, 1);
  const rootKind = candidate.expression?.kind || candidate.morphology?.kind || 'unknown';
  return `${rootKind}|${topologyKey(descriptor)}|n${band(descriptor.nodeCount, nodeWidth)}|d${band(descriptor.maxDepth, depthWidth)}`;
}

function noveltyAgainst(candidate, entries) {
  if (!entries.length) return 1;
  const nearestSimilarity = Math.max(...entries.map((entry) =>
    structuralSimilarity(candidate, entry.candidate)));
  return clamp01(1 - nearestSimilarity);
}

function entryFor(candidate, archive, options) {
  const quality = candidateQuality(candidate);
  const novelty = noveltyAgainst(candidate, archive);
  const qualityWeight = clamp01(options.qualityWeight ?? 0.7);
  return {
    candidate,
    candidateId: candidate.candidateId,
    niche: nicheFor(candidate, options),
    quality,
    novelty,
    utility: Number((quality * qualityWeight + novelty * (1 - qualityWeight)).toFixed(6))
  };
}

function compareEntries(left, right) {
  return right.quality - left.quality || right.novelty - left.novelty
    || String(left.candidateId).localeCompare(String(right.candidateId));
}

function publicEntry(entry) {
  return {
    candidateId: entry.candidateId,
    niche: entry.niche,
    quality: entry.quality,
    novelty: entry.novelty,
    utility: entry.utility,
    generation: entry.candidate.generation,
    descriptor: entry.candidate.descriptor
  };
}

class QualityDiversityArchive {
  constructor(options = {}) {
    this.options = { ...options };
    this.limit = positiveInteger(options.maxElites, DEFAULT_LIMIT);
    this.entries = new Map();
    this.observations = 0;
    this.rejections = 0;
  }

  offer(candidate) {
    this.observations += 1;
    if (!candidate || candidate.status !== 'evaluated' || candidateQuality(candidate) === null) {
      this.rejections += 1;
      return { accepted: false, reason: 'candidate_not_evaluated' };
    }
    const entry = entryFor(candidate, [...this.entries.values()], this.options);
    const current = this.entries.get(entry.niche);
    if (current && compareEntries(current, entry) <= 0) {
      this.rejections += 1;
      return { accepted: false, reason: 'niche_elite_dominates', niche: entry.niche };
    }
    this.entries.set(entry.niche, entry);
    this.trim();
    return { accepted: this.entries.get(entry.niche) === entry,
      replacedCandidateId: current?.candidateId || null, niche: entry.niche };
  }

  addAll(candidates) {
    return (Array.isArray(candidates) ? candidates : []).map((candidate) => this.offer(candidate));
  }

  trim() {
    const retained = [...this.entries.values()].sort(compareEntries).slice(0, this.limit);
    this.entries = new Map(retained.map((entry) => [entry.niche, entry]));
  }

  eliteCandidates() {
    return [...this.entries.values()].sort(compareEntries).map((entry) => entry.candidate);
  }

  snapshot() {
    const elites = [...this.entries.values()].sort(compareEntries).map(publicEntry);
    return { method: 'quality_elite_per_structural_niche', limit: this.limit,
      observations: this.observations, rejections: this.rejections,
      nichesCovered: elites.length, elites };
  }
}

module.exports = { QualityDiversityArchive, nicheFor, noveltyAgainst };
