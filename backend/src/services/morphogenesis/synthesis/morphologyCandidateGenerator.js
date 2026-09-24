'use strict';

const CANDIDATE_LIMIT = 4;
const PATTERN_SCAN_LIMIT = 64;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function tagsFor(profile) {
  return Array.isArray(profile && profile.tags) ? profile.tags : [];
}

function scorePattern(pattern, tags, constraints) {
  const blocked = Array.isArray(pattern.blockedBy) ? pattern.blockedBy : [];
  if (blocked.some((item) => constraints.includes(item))) return -1;
  const overlaps = (pattern.tags || []).filter((tag) => tags.includes(tag)).length;
  return Number(pattern.priorWeight || 0) + overlaps * 0.1;
}

function bestPattern(patterns, profile, constraints) {
  const tags = tagsFor(profile);
  return patterns.slice(0, PATTERN_SCAN_LIMIT)
    .map((pattern) => ({ pattern, score: scorePattern(pattern, tags, constraints) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)[0] || null;
}

function makeCandidate(spec) {
  if (!spec || !spec.morphology) return null;
  return { ...spec, morphology: clone(spec.morphology) };
}

function currentCandidate(input) {
  return makeCandidate({
    id: 'M0', origin: 'current', morphology: input.currentMorphology,
    score: 1, evidence: input.currentEvidence || null
  });
}

function localCandidate(input) {
  const mutations = Array.isArray(input.localMutations) ? input.localMutations : [];
  const mutation = mutations.find((entry) => entry && entry.morphology);
  return makeCandidate(mutation && {
    id: 'M1', origin: 'minimal_local_mutation', morphology: mutation.morphology,
    score: mutation.score || 0, evidence: mutation.evidence || null
  });
}

function patternCandidate(input) {
  const patterns = Array.isArray(input.knownPatterns) ? input.knownPatterns : [];
  const constraints = Array.isArray(input.constraints) ? input.constraints : [];
  const profile = input.problemProfile || {};
  const known = bestPattern(patterns, profile, constraints);
  return makeCandidate(known && {
    id: `M2:${known.pattern.id}`, origin: 'best_known_pattern',
    morphology: known.pattern.pattern, score: known.score,
    evidence: known.pattern.evidenceStatus
  });
}

function alternativeCandidate(input) {
  const alternatives = Array.isArray(input.alternativeCompositions) ? input.alternativeCompositions : [];
  const alternative = alternatives.filter((entry) => entry && entry.morphology)
    .sort((left, right) => Number(right.valueScore || 0) - Number(left.valueScore || 0))[0];
  return makeCandidate(alternative && {
    id: `M3:${alternative.id || 'alternative'}`, origin: 'high_value_alternative',
    morphology: alternative.morphology, score: alternative.valueScore || 0, evidence: null
  });
}

function generateMorphologyCandidates(input = {}) {
  const candidates = [
    currentCandidate(input), localCandidate(input), patternCandidate(input), alternativeCandidate(input)
  ].filter(Boolean);
  return candidates.slice(0, CANDIDATE_LIMIT);
}

module.exports = { CANDIDATE_LIMIT, generateMorphologyCandidates };
