'use strict';

const SUSPICION_AUTHORS = new Set(['marx', 'nietzsche', 'freud', 'ricoeur']);

function interpret(input = {}) {
  const text = requireNonEmpty(input.text, 'text');
  const normalized = buildHermeneuticInput(input, text);
  const horizon = normalizeHorizon(normalized.horizon);
  const otherHorizon = normalizeHorizon(normalized.otherHorizon);
  return {
    kind: 'HermeneuticInterpretation',
    text,
    parts: normalized.parts,
    whole: normalized.whole,
    horizon,
    tradition: normalized.tradition,
    prejudices: normalized.prejudices,
    questions: normalized.questions,
    fusionOfHorizons: assessFusion(horizon, otherHorizon),
    circle: { iterations: normalized.iterations, nextQuestion: normalized.nextQuestion },
    interpretation: normalized.interpretation,
    confidence: boundedConfidence(normalized.confidence),
    status: 'provisional',
    revisable: true
  };
}

function requireNonEmpty(value, field) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error(`${field} must be a non-empty string.`);
  return trimmed;
}

function buildHermeneuticInput(input, text) {
  return {
    parts: toArray(input.parts),
    whole: input.whole || text,
    tradition: toArray(input.tradition),
    prejudices: toArray(input.prejudices),
    questions: toArray(input.questions),
    horizon: input.horizon || {},
    otherHorizon: input.otherHorizon || {},
    iterations: toArray(input.iterations),
    nextQuestion: input.nextQuestion || null,
    interpretation: input.interpretation || null,
    confidence: input.confidence
  };
}

function toArray(value) { return Array.isArray(value) ? value : []; }

function normalizeHorizon(horizon) {
  return {
    interpreter: horizon.interpreter || null,
    language: horizon.language || null,
    historicalSituation: horizon.historicalSituation || null,
    concerns: toArray(horizon.concerns)
  };
}

function assessFusion(first, second) {
  const comparable = commonFields(first, second);
  const sharedConcerns = sharedConcernsBetween(first.concerns || [], second.concerns || []);
  return buildFusionResult(comparable, sharedConcerns);
}

function commonFields(first, second) {
  return ['language', 'historicalSituation'].filter((f) => first[f] && second[f]);
}

function sharedConcernsBetween(a, b) {
  return a.filter((c) => b.includes(c));
}

function buildFusionResult(comparable, sharedConcerns) {
  const possible = comparable.length > 0 || sharedConcerns.length > 0;
  return {
    comparableFields: comparable,
    sharedConcerns,
    possible,
    status: possible ? 'partial' : 'undetermined'
  };
}

function analyzeSuspicion(input = {}) {
  const text = requireNonEmpty(input.text, 'text');
  const author = resolveAuthor(input.author);
  if (!SUSPICION_AUTHORS.has(author)) throw new Error(`Unknown suspicion tradition '${author}'.`);
  return {
    text,
    author,
    surfaceMeaning: input.surfaceMeaning || null,
    suspectedStructure: input.suspectedStructure || null,
    interests: toArray(input.interests),
    status: 'hypothesis',
    interpretationStatus: 'suspicious_reading'
  };
}

function resolveAuthor(author) {
  return String(author || '').trim().toLowerCase();
}

function analyzeNarrative(input = {}) {
  const events = toArray(input.events);
  if (!events.length) throw new Error('events must contain at least one element.');
  return {
    kind: 'NarrativeConfiguration',
    events,
    temporalOrder: input.temporalOrder || 'chronological',
    emplotment: input.emplotment || null,
    identityThread: input.identityThread || null,
    metaphor: input.metaphor || null,
    status: 'interpretive'
  };
}

function boundedConfidence(value) {
  if (value == null) return null;
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('confidence must be a number between 0 and 1.');
  return confidence;
}

module.exports = { SUSPICION_AUTHORS, interpret, analyzeSuspicion, analyzeNarrative, assessFusion };
