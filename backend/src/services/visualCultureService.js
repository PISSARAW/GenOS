'use strict';

const MOVEMENT_PROFILES = Object.freeze({
  realism: ['observation', 'socialWorld', 'referentialDetail'],
  naturalism: ['determinism', 'environment', 'scientificObservation'],
  classicism: ['order', 'proportion', 'normativeForm'],
  romanticism: ['subjectivity', 'nature', 'imagination'],
  baroque: ['dramaticMovement', 'ornament', 'contrast'],
  rococo: ['ornament', 'playfulness', 'asymmetry'],
  'geometric-abstraction': ['geometry', 'nonReferentialForm', 'system'],
  abstraction: ['nonReferentialForm', 'color', 'autonomousComposition'],
  minimalism: ['reduction', 'seriality', 'materialPresence'],
  maximalism: ['density', 'multiplicity', 'excess'],
  surrealism: ['dreamLogic', 'uncanny', 'automaticAssociation'],
  cubism: ['multipleViewpoints', 'geometricDecomposition', 'collage'],
  futurism: ['speed', 'technology', 'dynamicForce'],
  dada: ['antiArt', 'chance', 'readymade'],
  'pop-art': ['massCulture', 'repetition', 'commodityImage'],
  'conceptual-art': ['ideaPrimacy', 'language', 'institutionalQuestioning'],
  'performance-art': ['body', 'liveAction', 'audienceRelation'],
  'digital-art': ['computation', 'interactivity', 'networkedProduction'],
  bioart: ['livingMaterial', 'laboratoryContext', 'ethicalQuestion'],
  'land-art': ['siteSpecificity', 'landscape', 'ephemerality'],
  'installation-art': ['spatialEnvironment', 'embodiment', 'spectatorPath'],
  cinema: ['movingImage', 'montage', 'projectionOrScreen']
});

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
  return object(args.subject || args.work || args.project || args.artwork || args);
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

function analyzeArchitecture(args = {}) {
  const subject = subjectOf(args);
  const dimensions = ['function', 'form', 'materiality', 'habitability', 'site'];
  const observations = Object.fromEntries(dimensions.map((key) => [key, subject[key] || null]));
  const observed = Object.values(observations).filter(Boolean).length;
  return {
    ...base('architecture.philosophy', args, 'provided_architectural_project'),
    observations,
    observedDimensions: observed,
    status: observed ? 'supported' : 'underdetermined',
    confidence: Number((observed / dimensions.length).toFixed(2)),
    uncertainty: Number((1 - observed / dimensions.length).toFixed(2)),
    questions: ['Comment la forme organise-t-elle l’habiter ?', 'Quel rapport le projet entretient-il avec son site ?']
  };
}

function analyzeDesign(args = {}) {
  const subject = subjectOf(args);
  const dimensions = ['use', 'affordance', 'accessibility', 'materiality', 'socialEffect'];
  const observations = Object.fromEntries(dimensions.map((key) => [key, subject[key] || null]));
  const observed = Object.values(observations).filter(Boolean).length;
  return {
    ...base('design.philosophy', args, 'provided_design_object'),
    observations,
    observedDimensions: observed,
    status: observed ? 'supported' : 'underdetermined',
    confidence: Number((observed / dimensions.length).toFixed(2)),
    uncertainty: Number((1 - observed / dimensions.length).toFixed(2)),
    questions: ['Quel usage le design rend-il possible ?', 'Quels utilisateurs sont inclus ou exclus ?']
  };
}

function analyzeDigitalArt(args = {}) {
  const subject = subjectOf(args);
  const dimensions = ['computation', 'generativity', 'interactivity', 'networkedProduction', 'ephemerality'];
  const observations = Object.fromEntries(dimensions.map((key) => [key, subject[key] || null]));
  const observed = Object.values(observations).filter(Boolean).length;
  return {
    ...base('digital-art.philosophy', args, 'provided_digital_artwork'),
    observations,
    medium: subject.medium || null,
    codeOrProcess: subject.codeOrProcess || null,
    observedDimensions: observed,
    status: observed ? 'supported' : 'underdetermined',
    confidence: Number((observed / dimensions.length).toFixed(2)),
    uncertainty: Number((1 - observed / dimensions.length).toFixed(2))
  };
}

function analyzeVideo(args = {}) {
  const subject = subjectOf(args);
  const dimensions = ['duration', 'recording', 'montage', 'screenRelation'];
  const observations = Object.fromEntries(dimensions.map((key) => [key, subject[key] || null]));
  const observed = Object.values(observations).filter(Boolean).length;
  return {
    ...base('video.philosophy', args, 'provided_video_work'),
    observations,
    observedDimensions: observed,
    status: observed ? 'supported' : 'underdetermined',
    confidence: Number((observed / dimensions.length).toFixed(2)),
    uncertainty: Number((1 - observed / dimensions.length).toFixed(2))
  };
}

function classifyMovement(args = {}) {
  const movement = String(args.movement || '').trim().toLowerCase();
  if (!MOVEMENT_PROFILES[movement]) throw new Error(`Unknown artistic movement '${movement}'.`);
  const subject = subjectOf(args);
  const criteria = MOVEMENT_PROFILES[movement];
  const features = new Set([...list(subject.features), ...list(args.features)]);
  const matched = criteria.filter((criterion) => features.has(criterion));
  const confidence = Number((matched.length / criteria.length).toFixed(2));
  return {
    ...base(`style.${movement}`, args, 'provided_artistic_features'),
    movement,
    criteria,
    matchedCriteria: matched,
    unmatchedCriteria: criteria.filter((criterion) => !features.has(criterion)),
    status: matched.length ? 'candidate' : 'underdetermined',
    confidence,
    uncertainty: Number((1 - confidence).toFixed(2)),
    conclusion: 'stylistic_affinity_not_exclusive_classification'
  };
}

module.exports = {
  MOVEMENT_PROFILES,
  analyzeArchitecture,
  analyzeDesign,
  analyzeDigitalArt,
  analyzeVideo,
  classifyMovement
};
