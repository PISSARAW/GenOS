'use strict';

const crypto = require('crypto');
const CHAMBERS = ['direct', 'structured', 'falsification'];
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'from', 'this', 'dans', 'pour', 'avec', 'une', 'des', 'les', 'qui', 'par', 'sur']);

function sourceIdentifiers(sourceEvidence) {
  const sources = Array.isArray(sourceEvidence) ? sourceEvidence : [];
  return new Set(['mission', ...sources.map((source) => typeof source === 'string' ? source : source?.id).filter(Boolean).map(String)]);
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const values = [];
  for (const item of value) {
    const normalized = String(item).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
    if (values.length === 12) break;
  }
  return values;
}

function normalizeExperiment(value) {
  if (!value || typeof value !== 'object') return null;
  const protocol = String(value.protocol || '').trim();
  const expectedOutcome = String(value.expectedOutcome || '').trim();
  if (protocol.length < 12 || expectedOutcome.length < 3) return null;
  return { protocol, expectedOutcome };
}

function candidateSourceRefs(candidate) {
  const sourceRefs = Array.isArray(candidate.sourceRefs) && candidate.sourceRefs.length
    ? [...new Set(candidate.sourceRefs.map(String))]
    : ['mission'];
  return sourceRefs;
}

function normalizeCandidate(candidate, knownSources) {
  if (!candidate || typeof candidate !== 'object') return null;
  const hypothesis = String(candidate.hypothesis || candidate.statement || '').trim();
  const sourceRefs = candidateSourceRefs(candidate);
  if (hypothesis.length < 12 || hasUnknownSource(sourceRefs, knownSources)) return null;
  const digest = crypto.createHash('sha256').update(hypothesis.toLowerCase()).digest('hex').slice(0, 12);
  return {
    id: String(candidate.id || `hypothesis_${digest}`),
    chamber: CHAMBERS.includes(candidate.chamber) ? candidate.chamber : null,
    hypothesis,
    sourceRefs,
    assumptions: stringList(candidate.assumptions),
    predictions: stringList(candidate.predictions),
    falsificationCriteria: stringList(candidate.falsificationCriteria),
    experiment: normalizeExperiment(candidate.experiment)
  };
}

function hasUnknownSource(sourceRefs, knownSources) {
  return sourceRefs.some((source) => !knownSources.has(source));
}

function normalizeCandidates(supplied = {}) {
  const knownSources = sourceIdentifiers(supplied.sourceEvidence);
  const raw = Array.isArray(supplied.candidateHypotheses) ? supplied.candidateHypotheses.slice(0, 12) : [];
  const seen = new Set();
  const seenIds = new Set();
  return raw.map((candidate) => normalizeCandidate(candidate, knownSources)).filter((candidate) => {
    if (!candidate) return false;
    const key = candidate.hypothesis.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key) || seenIds.has(candidate.id)) return false;
    seen.add(key);
    seenIds.add(candidate.id);
    return true;
  });
}

function selectTriplet(candidates) {
  if (candidates.length < CHAMBERS.length) return null;
  const pools = CHAMBERS.map((chamber) => candidates.filter((candidate) => !candidate.chamber || candidate.chamber === chamber));
  let best = null;
  for (const direct of pools[0]) {
    for (const structured of pools[1]) {
      for (const falsification of pools[2]) {
        const selected = [direct, structured, falsification];
        if (new Set(selected.map((candidate) => candidate.id)).size !== CHAMBERS.length) continue;
        const triplet = selected.map((candidate, index) => ({ ...candidate, chamber: CHAMBERS[index] }));
        if (preferTriplet(triplet, best)) best = triplet;
      }
    }
  }
  return best;
}

function preferTriplet(candidate, current) {
  if (!current) return true;
  const candidateScore = scoreTriplet(candidate);
  const currentScore = scoreTriplet(current);
  if (candidateScore.orthogonalityScore !== currentScore.orthogonalityScore) {
    return candidateScore.orthogonalityScore > currentScore.orthogonalityScore;
  }
  if (candidateScore.falsifiabilityScore !== currentScore.falsifiabilityScore) {
    return candidateScore.falsifiabilityScore > currentScore.falsifiabilityScore;
  }
  return candidate.map((item) => item.id).join('|') < current.map((item) => item.id).join('|');
}

function hypothesisText(candidate, fallback) {
  if (!candidate) return fallback;
  const lines = [candidate.hypothesis, `Source references: ${candidate.sourceRefs.join(', ')}`];
  const assumptions = Array.isArray(candidate.assumptions) ? candidate.assumptions : [];
  const predictions = Array.isArray(candidate.predictions) ? candidate.predictions : [];
  const falsificationCriteria = Array.isArray(candidate.falsificationCriteria) ? candidate.falsificationCriteria : [];
  if (assumptions.length) lines.push(`Assumptions to test: ${assumptions.join('; ')}`);
  if (predictions.length) lines.push(`Predictions: ${predictions.join('; ')}`);
  if (falsificationCriteria.length) lines.push(`Falsification criteria: ${falsificationCriteria.join('; ')}`);
  if (candidate.experiment) {
    lines.push(`Discriminating protocol: ${candidate.experiment.protocol}`);
    lines.push(`Expected observation for this hypothesis: ${candidate.experiment.expectedOutcome}`);
  }
  return lines.join('\n');
}

function buildDiscriminatingExperiment(selectedTriplet) {
  const proposals = selectedTriplet.map((candidate) => candidate.experiment);
  if (proposals.some((proposal) => !proposal)) return null;
  const protocols = new Set(proposals.map((proposal) => proposal.protocol.toLowerCase().replace(/\s+/g, ' ')));
  const outcomes = new Set(proposals.map((proposal) => proposal.expectedOutcome.toLowerCase().replace(/\s+/g, ' ')));
  if (protocols.size !== 1 || outcomes.size < 2) return null;
  const protocol = proposals[0].protocol;
  const predictions = selectedTriplet.map((candidate) => ({
    hypothesisId: candidate.id || null,
    chamber: candidate.chamber,
    expectedOutcome: candidate.experiment.expectedOutcome,
    sourceRefs: candidate.sourceRefs || ['mission']
  }));
  const digest = crypto.createHash('sha256').update(JSON.stringify({ protocol, predictions })).digest('hex').slice(0, 16);
  return { id: `experiment_${digest}`, protocol, predictions, status: 'proposed', method: 'shared_protocol_divergent_predictions_v1' };
}

function hypothesisTokens(candidate) {
  return new Set(String(candidate.hypothesis || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

function jaccardSimilarity(left, right) {
  const leftTokens = hypothesisTokens(left);
  const rightTokens = hypothesisTokens(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function scoreTriplet(selectedTriplet) {
  const pairs = [[0, 1], [0, 2], [1, 2]];
  const similarity = pairs.reduce((sum, [left, right]) => sum + jaccardSimilarity(selectedTriplet[left], selectedTriplet[right]), 0) / pairs.length;
  const falsifiable = selectedTriplet.filter((candidate) => candidate.predictions?.length && candidate.falsificationCriteria?.length).length;
  return {
    orthogonalityScore: Number((1 - similarity).toFixed(4)),
    falsifiabilityScore: Number((falsifiable / selectedTriplet.length).toFixed(4)),
    scoredFalsifiableHypotheses: falsifiable,
    scoringMethod: 'token_jaccard_and_explicit_falsifier_v1'
  };
}

module.exports = { normalizeCandidates, selectTriplet, hypothesisText, scoreTriplet, buildDiscriminatingExperiment };
