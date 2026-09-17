'use strict';

const PLAY_TYPES = Object.freeze(['agon', 'alea', 'mimicry', 'ilinx']);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function confidence(observed, total) {
  const value = Number((observed / total).toFixed(2));
  return { confidence: value, uncertainty: Number((1 - value).toFixed(2)) };
}

function base(concept, args, source) {
  return {
    concept,
    status: 'interpretive',
    revisable: true,
    provenance: { source, philosophicalStatus: 'interpretive' },
    evidenceRequired: []
  };
}

function classifyPlayType(args = {}) {
  const subject = object(args.game || args.play || args.subject || args);
  const detected = PLAY_TYPES.filter((type) => subject[type] === true || subject.type === type);
  const rules = list(subject.rules);
  return {
    ...base('play.play', args, 'provided_play_features'),
    types: detected,
    rules,
    voluntary: subject.voluntary !== false,
    structured: Boolean(rules.length || subject.structured),
    status: detected.length || rules.length ? 'supported' : 'underdetermined',
    ...confidence(detected.length + (rules.length ? 1 : 0), 5),
    theorists: ['Johan Huizinga', 'Roger Caillois']
  };
}

function assessMagicCircle(args = {}) {
  const subject = object(args.game || args.play || args.subject || args);
  const boundaries = list(subject.boundaries || subject.rules);
  const participants = list(subject.participants);
  const temporal = Boolean(subject.timeLimit || subject.session);
  const observed = [boundaries.length > 0, participants.length > 0, temporal].filter(Boolean).length;
  return {
    ...base('play.magic-circle', args, 'provided_play_boundaries'),
    boundaries,
    participantCount: participants.length,
    temporalBoundary: temporal,
    circle: observed === 3 ? 'constituted' : observed ? 'partial' : 'not_observed',
    ...confidence(observed, 3),
    theorist: 'Johan Huizinga'
  };
}

function evaluatePlayType(args = {}) {
  const type = String(args.type || '').toLowerCase();
  if (!PLAY_TYPES.includes(type)) throw new Error(`Unknown play type '${type}'.`);
  const result = classifyPlayType({ ...args, subject: { ...(args.subject || {}), type } });
  return { ...result, concept: `play.${type}`, selectedType: type, status: 'supported' };
}

function evaluateSeriousGame(args = {}) {
  const subject = object(args.game || args.subject || args);
  const objectives = list(subject.objectives || args.objectives);
  const learningOutcomes = list(subject.learningOutcomes || args.learningOutcomes);
  const fictionalFrame = subject.fictionalFrame || null;
  return {
    ...base('play.serious-games', args, 'provided_game_design'),
    objectives,
    learningOutcomes,
    fictionalFrame,
    seriousPurpose: objectives.length > 0 || learningOutcomes.length > 0,
    status: objectives.length || learningOutcomes.length ? 'supported' : 'underdetermined',
    ...confidence(Number(Boolean(objectives.length)) + Number(Boolean(learningOutcomes.length)), 2)
  };
}

function analyzeGameStudies(args = {}) {
  const subject = object(args.game || args.subject || args);
  const dimensions = list(args.dimensions || subject.dimensions);
  return {
    ...base('play.game-studies', args, 'provided_game_observations'),
    dimensions,
    mechanics: subject.mechanics || null,
    playerExperience: subject.playerExperience || null,
    socialContext: subject.socialContext || null,
    status: dimensions.length ? 'supported' : 'underdetermined',
    ...confidence(dimensions.length ? 1 : 0, 1)
  };
}

function analyzeFictionality(args = {}) {
  const work = object(args.work || args.subject || args);
  const markers = list(work.fictionalMarkers || args.fictionalMarkers);
  const worlds = list(work.worlds || args.worlds);
  return {
    ...base('narrative.fictionality', args, 'provided_narrative_features'),
    markers,
    worlds,
    makeBelieve: work.makeBelieve !== false,
    fictionality: markers.length || worlds.length ? 'candidate' : 'underdetermined',
    status: markers.length || worlds.length ? 'supported' : 'underdetermined',
    ...confidence(Number(Boolean(markers.length)) + Number(Boolean(worlds.length)), 2),
    theorists: ['Kendall Walton', 'Gregory Currie', 'John Searle']
  };
}

function buildMakeBelieve(args = {}) {
  const props = list(args.props || args.propositions);
  const imagination = list(args.imagined || args.inferences);
  return {
    ...base('narrative.make-believe', args, 'provided_make_believe_practice'),
    props,
    imagined: imagination,
    ruleCount: props.length,
    status: props.length || imagination.length ? 'supported' : 'underdetermined',
    ...confidence(Number(Boolean(props.length)) + Number(Boolean(imagination.length)), 2),
    theorist: 'Kendall Walton'
  };
}

function analyzeProps(args = {}) {
  const props = list(args.props || args.objects);
  return {
    ...base('narrative.props', args, 'provided_fictional_props'),
    props,
    prescriptiveRules: list(args.prescriptiveRules || args.rules),
    function: args.function || 'generate_fictional_truths',
    status: props.length ? 'supported' : 'underdetermined',
    ...confidence(props.length ? 1 : 0, 1),
    theorist: 'Kendall Walton'
  };
}

function assessTruthInFiction(args = {}) {
  const propositions = list(args.propositions || args.fictionalTruths);
  const world = object(args.world || args.fictionalWorld);
  const assessed = propositions.map((proposition) => ({
    proposition,
    trueInWorld: world[proposition] === true,
    status: Object.prototype.hasOwnProperty.call(world, proposition) ? 'evaluated' : 'underdetermined'
  }));
  return {
    ...base('narrative.truth-in-fiction', args, 'provided_fictional_world'),
    world,
    assessments: assessed,
    status: assessed.length ? 'supported' : 'underdetermined',
    ...confidence(assessed.filter((item) => item.status === 'evaluated').length, Math.max(1, assessed.length)),
    caveat: 'Vérité dans une fiction ne signifie pas vérité dans le monde réel.'
  };
}

function analyzeFictionalDiscourse(args = {}) {
  const text = String(args.text || '').trim();
  if (!text) throw new Error('text must be a non-empty string.');
  return {
    ...base('narrative.fictional-discourse', args, 'provided_fictional_text'),
    text,
    illocution: args.illocution || 'make_believe_invitation',
    assertedOutsideFiction: false,
    status: 'supported',
    confidence: 1,
    uncertainty: 0,
    theorist: 'John Searle'
  };
}

function analyzeNarration(args = {}) {
  const events = list(args.events);
  const order = args.order || 'chronological';
  return {
    ...base('narrative.narration', args, 'provided_narrative_structure'),
    events,
    order,
    narrator: args.narrator || null,
    focalization: args.focalization || null,
    emplotment: args.emplotment || null,
    status: events.length ? 'supported' : 'underdetermined',
    ...confidence(events.length ? 1 : 0, 1)
  };
}

function analyzeLiterature(args = {}) {
  const text = String(args.text || '').trim();
  const genre = args.genre || null;
  return {
    ...base('narrative.literature', args, 'provided_literary_work'),
    text: text || null,
    genre,
    language: args.language || null,
    formalFeatures: list(args.formalFeatures),
    status: text || genre ? 'supported' : 'underdetermined',
    ...confidence(Number(Boolean(text)) + Number(Boolean(genre)), 2)
  };
}

function analyzeNovel(args = {}) {
  const result = analyzeNarration(args);
  return {
    ...result,
    concept: 'narrative.novel',
    characters: list(args.characters),
    setting: args.setting || null,
    pointOfView: args.pointOfView || null,
    genre: args.genre || 'novel'
  };
}

module.exports = {
  classifyPlayType,
  assessMagicCircle,
  evaluatePlayType,
  evaluateSeriousGame,
  analyzeGameStudies,
  analyzeFictionality,
  buildMakeBelieve,
  analyzeProps,
  assessTruthInFiction,
  analyzeFictionalDiscourse,
  analyzeNarration,
  analyzeLiterature,
  analyzeNovel
};
