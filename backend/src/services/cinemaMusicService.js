'use strict';

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) return null;
  return Math.max(0, Math.min(1, result));
}

function subjectOf(args) {
  return object(args.film || args.music || args.work || args.subject || args);
}

function base(concept, args, source) {
  return {
    concept,
    status: 'interpretive',
    revisable: true,
    provenance: { source, philosophicalStatus: 'interpretive' },
    confidence: args.confidence === undefined ? null : number(args.confidence),
    uncertainty: args.confidence === undefined ? null : Number((1 - number(args.confidence)).toFixed(2))
  };
}

function assessFeatures(concept, args, features, source) {
  const subject = subjectOf(args);
  const observations = Object.fromEntries(features.map((feature) => [feature, number(subject[feature])]));
  const observed = Object.values(observations).filter((value) => value !== null).length;
  const score = Number((observed / features.length).toFixed(2));
  return {
    ...base(concept, args, source),
    observations,
    observedFeatures: observed,
    featureCount: features.length,
    status: observed === features.length ? 'supported' : observed ? 'underdetermined' : 'not_observed',
    confidence: score,
    uncertainty: Number((1 - score).toFixed(2)),
    evidenceRequired: observed === features.length ? [] : ['media_specific_observations']
  };
}

function analyzeCinematicSignification(args = {}) {
  const result = assessFeatures('cinema.cinematic-signification', args, ['imageTrack', 'soundTrack', 'editing', 'syntagmaticStructure'], 'provided_cinematic_signifiers');
  return { ...result, theorist: 'Christian Metz', signification: args.signification || null };
}

function evaluateMovementImage(args = {}) {
  const result = assessFeatures('cinema.movement-image', args, ['movement', 'perception', 'action', 'sensoryMotorLink'], 'provided_movement_image_features');
  return { ...result, theorist: 'Gilles Deleuze', imageType: 'movement-image' };
}

function evaluateTimeImage(args = {}) {
  const result = assessFeatures('cinema.time-image', args, ['directTime', 'crystalStructure', 'memory', 'duration'], 'provided_time_image_features');
  return { ...result, theorist: 'Gilles Deleuze', imageType: 'time-image' };
}

function evaluateCrystalImage(args = {}) {
  const result = assessFeatures('cinema.crystal-image', args, ['actualVirtualIndiscernibility', 'mirrorRelation', 'coexistingTemporalities'], 'provided_crystal_image_features');
  return { ...result, theorist: 'Gilles Deleuze', imageType: 'crystal-image' };
}

function assessMechanicalReproduction(args = {}) {
  const subject = subjectOf(args);
  return {
    ...base('cinema.mechanical-reproduction', args, 'provided_reproduction_context'),
    reproducible: subject.reproducible !== false,
    copies: Number.isFinite(Number(subject.copies)) ? Number(subject.copies) : null,
    distribution: subject.distribution || null,
    originalAccess: subject.originalAccess === true,
    theorist: 'Walter Benjamin',
    auraPressure: subject.reproducible === false ? 'low' : 'transformed',
    status: subject.reproducible === undefined ? 'underdetermined' : 'supported',
    confidence: subject.reproducible === undefined ? 0 : 1,
    uncertainty: subject.reproducible === undefined ? 1 : 0
  };
}

function assessAura(args = {}) {
  const subject = subjectOf(args);
  const distance = number(subject.distance || subject.uniqueness);
  return {
    ...base('cinema.aura', args, 'provided_aura_features'),
    uniqueness: number(subject.uniqueness),
    historicalDistance: distance,
    presence: subject.presence || null,
    aura: distance === null ? 'underdetermined' : distance >= 0.5 ? 'candidate' : 'attenuated',
    theorist: 'Walter Benjamin',
    confidence: distance === null ? 0 : 0.5,
    uncertainty: distance === null ? 1 : 0.5
  };
}

function analyzeFilmNarration(args = {}) {
  const subject = subjectOf(args);
  const events = list(subject.events || args.events);
  return {
    ...base('cinema.film-narration', args, 'provided_film_structure'),
    events,
    narration: subject.narration || args.narration || null,
    temporalOrder: subject.temporalOrder || 'chronological',
    focalization: subject.focalization || null,
    status: events.length ? 'supported' : 'underdetermined',
    confidence: events.length ? 1 : 0,
    uncertainty: events.length ? 0 : 1,
    theorist: 'David Bordwell'
  };
}

function evaluateCognitiveReception(args = {}) {
  const subject = subjectOf(args);
  const cues = list(subject.cues || args.cues);
  return {
    ...base('cinema.cognitive-theory', args, 'provided_viewer_cues'),
    cues,
    hypotheses: list(args.hypotheses),
    viewerInference: subject.viewerInference || null,
    status: cues.length ? 'supported' : 'underdetermined',
    confidence: cues.length ? 1 : 0,
    uncertainty: cues.length ? 0 : 1,
    theorist: 'David Bordwell'
  };
}

function analyzeOrdinaryLanguage(args = {}) {
  const subject = subjectOf(args);
  return {
    ...base('cinema.ordinary-language', args, 'provided_film_situation'),
    situation: subject.situation || null,
    recognition: subject.recognition || null,
    ordinaryWorld: subject.ordinaryWorld || null,
    status: subject.situation ? 'supported' : 'underdetermined',
    confidence: subject.situation ? 1 : 0,
    uncertainty: subject.situation ? 0 : 1,
    theorist: 'Stanley Cavell'
  };
}

function analyzeMusicalForm(args = {}) {
  const subject = subjectOf(args);
  const features = list(subject.form || args.form);
  return {
    ...base('music.musically-beautiful', args, 'provided_musical_form'),
    form: features,
    formalRelations: subject.formalRelations || null,
    autonomousStructure: subject.autonomousStructure === true,
    status: features.length ? 'supported' : 'underdetermined',
    confidence: features.length ? 1 : 0,
    uncertainty: features.length ? 0 : 1,
    theorists: ['Eduard Hanslick', 'Theodor Adorno']
  };
}

function evaluateMusicalExpression(args = {}) {
  const result = assessFeatures('music.expression', args, ['expressiveContour', 'gesture', 'timbre'], 'provided_musical_expression');
  return { ...result, theorist: 'Roger Scruton' };
}

function assessMusicalEmotion(args = {}) {
  const subject = subjectOf(args);
  const emotion = subject.emotion || args.emotion || null;
  return {
    ...base('music.emotion', args, 'provided_musical_emotion'),
    emotion,
    arousal: number(subject.arousal),
    valence: number(subject.valence),
    listenerResponse: subject.listenerResponse || null,
    status: emotion ? 'supported' : 'underdetermined',
    confidence: emotion ? 1 : 0,
    uncertainty: emotion ? 0 : 1,
    theorist: 'Leonard Meyer'
  };
}

function analyzeTensionExpectation(args = {}) {
  const result = assessFeatures('music.tension-expectation', args, ['tension', 'expectation', 'resolution'], 'provided_musical_expectation');
  return { ...result, theorist: 'Leonard Meyer' };
}

function assessAutonomy(args = {}) {
  const subject = subjectOf(args);
  return {
    ...base('music.autonomous-art', args, 'provided_music_context'),
    autonomy: subject.autonomy === true,
    externalFunction: subject.externalFunction || null,
    commodityRelation: subject.commodityRelation || null,
    status: subject.autonomy === undefined ? 'underdetermined' : 'supported',
    confidence: subject.autonomy === undefined ? 0 : 1,
    uncertainty: subject.autonomy === undefined ? 1 : 0,
    theorist: 'Theodor Adorno'
  };
}

function assessCultureIndustry(args = {}) {
  const subject = subjectOf(args);
  const indicators = list(subject.indicators || args.indicators);
  return {
    ...base('music.culture-industry', args, 'provided_music_industry_context'),
    indicators,
    standardization: number(subject.standardization),
    massDistribution: subject.massDistribution === true,
    commodification: number(subject.commodification),
    status: indicators.length ? 'supported' : 'underdetermined',
    confidence: indicators.length ? 1 : 0,
    uncertainty: indicators.length ? 0 : 1,
    theorist: 'Theodor Adorno'
  };
}

module.exports = {
  analyzeCinematicSignification,
  evaluateMovementImage,
  evaluateTimeImage,
  evaluateCrystalImage,
  assessMechanicalReproduction,
  assessAura,
  analyzeFilmNarration,
  evaluateCognitiveReception,
  analyzeOrdinaryLanguage,
  analyzeMusicalForm,
  evaluateMusicalExpression,
  assessMusicalEmotion,
  analyzeTensionExpectation,
  assessAutonomy,
  assessCultureIndustry
};
