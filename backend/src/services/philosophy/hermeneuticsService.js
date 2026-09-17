'use strict';

const SUSPICION_AUTHORS = new Set(['marx', 'nietzsche', 'freud', 'ricoeur']);

function interpret(input = {}) {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text must be a non-empty string.');
  const parts = Array.isArray(input.parts) ? input.parts : [];
  const horizon = normalizeHorizon(input.horizon || {});
  const iterations = Array.isArray(input.iterations) ? input.iterations : [];
  return {
    kind: 'HermeneuticInterpretation',
    text,
    parts,
    whole: input.whole || text,
    horizon,
    tradition: Array.isArray(input.tradition) ? input.tradition : [],
    prejudices: Array.isArray(input.prejudices) ? input.prejudices : [],
    questions: Array.isArray(input.questions) ? input.questions : [],
    fusionOfHorizons: assessFusion(horizon, input.otherHorizon || {}),
    circle: { iterations, nextQuestion: input.nextQuestion || null },
    interpretation: input.interpretation || null,
    confidence: boundedConfidence(input.confidence),
    status: 'provisional',
    revisable: true
  };
}

function normalizeHorizon(horizon) {
  return {
    interpreter: horizon.interpreter || null,
    language: horizon.language || null,
    historicalSituation: horizon.historicalSituation || null,
    concerns: Array.isArray(horizon.concerns) ? horizon.concerns : []
  };
}

function assessFusion(first, second) {
  const fields = ['language', 'historicalSituation'];
  const comparable = fields.filter((field) => first[field] && second[field]);
  const sharedConcerns = (first.concerns || []).filter((concern) => (second.concerns || []).includes(concern));
  return {
    comparableFields: comparable,
    sharedConcerns,
    possible: comparable.length > 0 || sharedConcerns.length > 0,
    status: comparable.length || sharedConcerns.length ? 'partial' : 'undetermined'
  };
}

function analyzeSuspicion(input = {}) {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text must be a non-empty string.');
  const author = String(input.author || '').trim().toLowerCase();
  if (!SUSPICION_AUTHORS.has(author)) throw new Error(`Unknown suspicion tradition '${author}'.`);
  return {
    text,
    author,
    surfaceMeaning: input.surfaceMeaning || null,
    suspectedStructure: input.suspectedStructure || null,
    interests: Array.isArray(input.interests) ? input.interests : [],
    status: 'hypothesis',
    interpretationStatus: 'suspicious_reading'
  };
}

function analyzeNarrative(input = {}) {
  const events = Array.isArray(input.events) ? input.events : [];
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
  if (value === undefined || value === null) return null;
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('confidence must be a number between 0 and 1.');
  return confidence;
}

module.exports = { SUSPICION_AUTHORS, interpret, analyzeSuspicion, analyzeNarrative, assessFusion };
