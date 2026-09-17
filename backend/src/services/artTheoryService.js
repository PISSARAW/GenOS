'use strict';

const THEORY_CRITERIA = Object.freeze({
  significantForm: ['unity', 'complexity', 'formalRelations'],
  institutional: ['artworldRecognition', 'curatorialContext', 'artisticIntention'],
  expression: ['emotion', 'expression', 'audienceTransmission'],
  mimesis: ['resemblance', 'transformation', 'narrativeOrCatharticEffect'],
  representation: ['denotation', 'exemplification', 'reference', 'symbolicSystem']
});

function subjectOf(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  return args.subject || args.work || args.artwork || args;
}

function valueOf(subject, key) {
  const value = Number(subject[key]);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function profile(subject, criteria) {
  return Object.fromEntries(criteria.map((key) => [key, valueOf(subject, key)]));
}

function evidence(profileValue) {
  return Object.values(profileValue).filter((value) => value !== null).length;
}

function assessment(concept, criteria, profileValue) {
  const observed = evidence(profileValue);
  const confidence = Number((observed / criteria.length).toFixed(2));
  return {
    concept,
    criteria,
    observations: profileValue,
    observedCriteria: observed,
    status: observed === criteria.length ? 'supported' : observed ? 'underdetermined' : 'not_observed',
    confidence,
    uncertainty: Number((1 - confidence).toFixed(2)),
    provenance: { source: 'provided_art_features', philosophicalStatus: 'interpretive' },
    evidenceRequired: observed === criteria.length ? [] : ['artwork_or_contextual_observations']
  };
}

function evaluateSignificantForm(args = {}) {
  const subject = subjectOf(args);
  const result = assessment('art.significant-form', THEORY_CRITERIA.significantForm, profile(subject, THEORY_CRITERIA.significantForm));
  return { ...result, theorist: 'Clive Bell / Roger Fry', focus: 'formal relations producing aesthetic significance' };
}

function evaluateInstitutionalContext(args = {}) {
  const subject = subjectOf(args);
  const result = assessment('art.institutional-theory', THEORY_CRITERIA.institutional, profile(subject, THEORY_CRITERIA.institutional));
  return { ...result, theorists: ['Arthur Danto', 'George Dickie'], focus: 'artworld and institutional context' };
}

function evaluateExpression(args = {}) {
  const subject = subjectOf(args);
  const result = assessment('art.expressionism', THEORY_CRITERIA.expression, profile(subject, THEORY_CRITERIA.expression));
  return { ...result, theorists: ['Croce', 'Collingwood', 'Tolstoy'], focus: 'expression and transmission of emotion' };
}

function evaluateMimesis(args = {}) {
  const subject = subjectOf(args);
  const result = assessment('art.mimesis', THEORY_CRITERIA.mimesis, profile(subject, THEORY_CRITERIA.mimesis));
  return { ...result, theorists: ['Plato', 'Aristotle'], catharsis: result.observations.narrativeOrCatharticEffect };
}

function evaluateRepresentation(args = {}) {
  const subject = subjectOf(args);
  const result = assessment('art.representation', THEORY_CRITERIA.representation, profile(subject, THEORY_CRITERIA.representation));
  return { ...result, theorist: 'Nelson Goodman', focus: 'reference, denotation, exemplification and symbol systems' };
}

function compareArtDefinitions(args = {}) {
  const subject = subjectOf(args);
  const candidates = [
    evaluateSignificantForm({ subject }),
    evaluateInstitutionalContext({ subject }),
    evaluateExpression({ subject }),
    evaluateMimesis({ subject }),
    evaluateRepresentation({ subject })
  ];
  return {
    concept: 'art.definition',
    theories: candidates.map((candidate) => ({
      concept: candidate.concept,
      status: candidate.status,
      confidence: candidate.confidence,
      observedCriteria: candidate.observedCriteria
    })),
    compatibleTheories: candidates.filter((candidate) => candidate.status === 'supported').map((candidate) => candidate.concept),
    unresolved: candidates.filter((candidate) => candidate.status !== 'supported').map((candidate) => candidate.concept),
    conclusion: 'comparison_only',
    provenance: { source: 'provided_art_features', philosophicalStatus: 'interpretive' }
  };
}

function compareTheoryCriteria(args = {}) {
  const requested = Array.isArray(args.theories) ? args.theories : Object.keys(THEORY_CRITERIA);
  const available = requested.filter((theory) => THEORY_CRITERIA[theory]);
  return {
    concept: 'art.cluster-theory',
    requestedTheories: requested,
    criteria: Object.fromEntries(available.map((theory) => [theory, THEORY_CRITERIA[theory]])),
    validTheoryCount: available.length,
    status: available.length ? 'supported' : 'not_observed',
    confidence: available.length ? 1 : 0,
    uncertainty: available.length ? 0 : 1,
    provenance: { source: 'registered_theory_criteria', philosophicalStatus: 'conceptual' }
  };
}

function evaluateOpenConcept(args = {}) {
  const subject = subjectOf(args);
  const features = Array.isArray(subject.features) ? subject.features : [];
  return {
    concept: 'art.open-concept',
    featureCount: features.length,
    features,
    status: features.length ? 'candidate' : 'underdetermined',
    confidence: features.length ? 0.5 : 0,
    uncertainty: features.length ? 0.5 : 1,
    conclusion: 'no_fixed_necessary_and_sufficient_definition',
    provenance: { source: 'provided_art_features', philosophicalStatus: 'interpretive' }
  };
}

function evaluateFictionalReference(args = {}) {
  const subject = subjectOf(args);
  const entities = Array.isArray(subject.entities) ? subject.entities : [];
  return {
    concept: 'art.fictional-reference',
    entities,
    referenceMode: subject.referenceMode || 'make_believe',
    status: entities.length ? 'candidate' : 'underdetermined',
    confidence: entities.length ? 0.5 : 0,
    uncertainty: entities.length ? 0.5 : 1,
    provenance: { source: 'provided_fictional_entities', philosophicalStatus: 'interpretive' }
  };
}

module.exports = {
  evaluateSignificantForm,
  evaluateInstitutionalContext,
  evaluateExpression,
  evaluateMimesis,
  evaluateRepresentation,
  compareArtDefinitions,
  compareTheoryCriteria,
  evaluateOpenConcept,
  evaluateFictionalReference
};
