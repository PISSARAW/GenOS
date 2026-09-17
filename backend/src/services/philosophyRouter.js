'use strict';

const { validateRegistry, registryHealth: conceptRegistryHealth } = require('../philosophy/conceptRegistry');
const relationRegistry = require('../philosophy/relationRegistry');
const ontologyRouter = require('./ontologyRouter');
const runtimeEffects = require('./philosophyRuntimeEffectService');
const ethicalComparison = require('./ethicalComparisonService');

const registry = validateRegistry();
if (!registry.valid) {
  throw new Error(`Invalid philosophical concept registry: ${registry.errors.join('; ')}`);
}
const definitions = registry.concepts;

const OPERATIONS = Object.freeze([
  'listConcepts', 'getConcept', 'registryHealth', 'evaluateConcept', 'applyRuntimeEffect',
  'listRelations', 'getNeighborhood', 'exportGraph', 'compareEthicalFrameworks', 'queryOntology'
]);
const conceptMap = new Map(definitions.map((concept) => [concept.id, concept]));

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function listConcepts(args = {}) {
  const filters = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  return definitions
    .filter((concept) => !filters.domain || concept.domain === filters.domain)
    .filter((concept) => !filters.family || concept.family === filters.family)
    .filter((concept) => !filters.school || concept.school === filters.school)
    .filter((concept) => !filters.status || concept.status === filters.status)
    .filter((concept) => !filters.genosDomain || concept.genosDomains.includes(filters.genosDomain))
    .filter((concept) => !filters.maturity || concept.serviceMaturity.level === filters.maturity)
    .map(copy);
}

function listRelations(args = {}) {
  return relationRegistry.listRelations({
    relationType: args.relationType,
    sourceId: args.sourceId,
    targetId: args.targetId
  }).map(copy);
}

function getNeighborhood(id, args = {}) {
  const concept = requireConcept(id);
  const relationSet = new Map();
  for (const relation of [
    ...listRelations({ sourceId: concept.id }),
    ...listRelations({ targetId: concept.id })
  ]) {
    const key = `${relation.source.id}|${relation.relationType}|${relation.target.id}`;
    relationSet.set(key, relation);
  }
  const relations = [...relationSet.values()];
  const relationIds = new Set(relations.map((relation) => relation.source.id === concept.id
    ? relation.target.id
    : relation.source.id));
  const neighbors = [...relationIds].map((neighborId) => getConcept(neighborId)).filter(Boolean);
  return { concept, relations, neighbors, depth: args.depth || 1 };
}

function exportGraph(args = {}) {
  const nodes = listConcepts(args);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = listRelations(args).filter((relation) => (
    nodeIds.has(relation.source.id) && nodeIds.has(relation.target.id)
  ));
  return { nodes, edges };
}

function getConcept(id) {
  return copy(conceptMap.get(String(id || '').trim()));
}

function registryHealth() {
  const health = conceptRegistryHealth();
  return {
    ...health,
    conceptCount: conceptMap.size,
  };
}

function requireConcept(id) {
  const concept = getConcept(id);
  if (!concept) throw new Error(`Unknown philosophical concept '${id}'.`);
  return concept;
}

function unavailable(concept) {
  return {
    concept: concept.id,
    status: concept.status,
    executable: false,
    supported: false,
    service: concept.service,
    message: 'This concept is registered but has no executable adapter yet.',
  };
}

function callService(serviceName, method, args) {
  const service = require(`./${serviceName}`);
  if (typeof service[method] !== 'function') {
    throw new Error(`No registered method '${method}' for service '${serviceName}'.`);
  }
  return service[method](args);
}

function callSelectedService({ serviceName, defaultMethod, allowedMethods, args }) {
  const method = args.operation || defaultMethod;
  if (!allowedMethods.includes(method)) {
    throw new Error(`Unsupported philosophy adapter operation '${method}'.`);
  }
  return callService(serviceName, method, args);
}

const ADAPTERS = {
  'epistemology.knowledge': ({ args }) => callService('knowledgeService', 'analyzeKnowledge', args),
  'epistemology.belief': ({ args }) => callService('knowledgeService', 'assessBelief', args),
  'epistemology.justification': ({ args }) => callService('knowledgeService', 'assessJustification', args),
  'epistemology.truth': ({ args }) => callService('knowledgeService', 'assessTruth', args),
  'epistemology.gettier-problem': ({ args }) => callService('knowledgeService', 'analyzeGettier', args),
  'epistemology.gettierized-knowledge': ({ args }) => callService('knowledgeService', 'analyzeGettier', args),
  'epistemology.post-gettier-defenses': ({ args }) => callService('knowledgeService', 'assessPostGettierDefenses', args),
  'method.deduction': ({ args }) => callService('inferenceService', 'inferDeductively', args),
  'method.induction': ({ args }) => callService('inferenceService', 'inferInductively', args),
  'method.abduction': ({ args }) => callService('inferenceService', 'inferAbductively', args),
  'method.inference-best-explanation': ({ args }) => callService('inferenceService', 'inferAbductively', args),
  'epistemology.plausibility': ({ args }) => callService('probabilityService', 'assessProbability', args),
  'method.bayesianism': ({ args }) => callService('probabilityService', 'bayesUpdate', args),
  'method.objective-subjective-probability': ({ args }) => callService('probabilityService', 'assessProbability', args),
  'truth.correspondence': ({ args }) => callService('truthSkepticismService', 'evaluateTruthTheory', { ...args, theory: 'correspondence' }),
  'truth.coherence': ({ args }) => callService('truthSkepticismService', 'evaluateTruthTheory', { ...args, theory: 'coherence' }),
  'truth.pragmatist': ({ args }) => callService('truthSkepticismService', 'evaluateTruthTheory', { ...args, theory: 'pragmatist' }),
  'truth.deflationary': ({ args }) => callService('truthSkepticismService', 'evaluateTruthTheory', { ...args, theory: 'deflationary' }),
  'truth.minimalism': ({ args }) => callService('truthSkepticismService', 'evaluateTruthTheory', { ...args, theory: 'minimalism' }),
  'truth.internal-realism': ({ args }) => callService('truthSkepticismService', 'evaluateTruthTheory', { ...args, theory: 'internal-realism' }),
  'epistemology.skepticism': ({ args }) => callService('truthSkepticismService', 'assessSkepticism', args),
  'epistemology.radical-skepticism': ({ args }) => callService('truthSkepticismService', 'assessSkepticism', { ...args, challenge: 'radical' }),
  'epistemology.relativism': ({ args }) => callService('truthSkepticismService', 'assessRelativism', args),
  'school.feminist-epistemology': ({ args }) => callService('socialEpistemologyService', 'assessEmancipatoryCritique', args),
  'school.social-epistemology': ({ args }) => callService('socialEpistemologyService', 'assessDiscussion', args),
  'school.standpoint-theory': ({ args }) => callService('socialEpistemologyService', 'assessSituatedKnowledge', args),
  'school.situated-knowledges': ({ args }) => callService('socialEpistemologyService', 'assessSituatedKnowledge', args),
  'social-epistemology.testimony': ({ args }) => callService('socialEpistemologyService', 'assessTestimony', args),
  'social-epistemology.discussion': ({ args }) => callService('socialEpistemologyService', 'assessDiscussion', args),
  'social-epistemology.cognitive-labor': ({ args }) => callService('socialEpistemologyService', 'assessCognitiveLabor', args),
  'social-epistemology.feminist': ({ args }) => callService('socialEpistemologyService', 'assessSituatedKnowledge', args),
  'social-epistemology.emancipatory-critique': ({ args }) => callService('socialEpistemologyService', 'assessEmancipatoryCritique', args),
  'method.hypothetico-deductive': ({ args }) => callService('scientificMethodService', 'assessHypotheticoDeductive', args),
  'science.confirmation': ({ args }) => callService('scientificMethodService', 'assessConfirmation', args),
  'science.falsification-demarcation': ({ args }) => callService('scientificMethodService', 'assessFalsification', args),
  'science.duhem-quine': ({ args }) => callService('scientificMethodService', 'assessDuhemQuine', args),
  'school.platonism': ({ args }) => callService('platonismService', 'getFormIdeal', args.formName || 'perfect_agent'),
  'school.aristotelianism': ({ args }) => callService('aristotelianService', 'categorize', { agent: args.agent }),
  'school.stoicism': ({ args }) => callService('stoicismService', 'isMonist', { agent: args.agent }),
  'school.epicureanism': ({ args }) => callService('epicureanService', 'atomSchema', { agent: args.agent }),
  'school.cartesianism': ({ args }) => callService('cartesianService', 'dualism', { agent: args.agent }),
  'school.leibnizianism': ({ args }) => callService('leibnizianService', 'monadologie', { agent: args.agent }),
  'school.spinozism': ({ args }) => callService('spinozaService', 'substanceUnique', { system: args.system || { agents: [] } }),
  'school.newtonianism': ({ args }) => callSelectedService({ serviceName: 'newtonianService', defaultMethod: 'espaceAbsolu', allowedMethods: ['espaceAbsolu', 'tempsAbsolu', 'mecaniqueClassique'], args }),
  'school.kantianism': ({ args }) => callSelectedService({ serviceName: 'kantianService', defaultMethod: 'categoriesAPriori', allowedMethods: ['phenomene', 'noumene', 'categoriesAPriori', 'critiqueRaisonPure', 'choseEnSoi'], args }),
  'school.hegelianism': ({ args }) => callSelectedService({ serviceName: 'hegelianService', defaultMethod: 'absoluteGeist', allowedMethods: ['dialectique', 'absoluteGeist', 'recognition'], args }),
  'school.schopenhauer': ({ args }) => callSelectedService({ serviceName: 'schopenhauerService', defaultMethod: 'willRepresentation', allowedMethods: ['willRepresentation', 'principiumRationis', 'denialOfWill'], args }),
  'school.nietzsche': ({ args }) => callSelectedService({ serviceName: 'nietzscheService', defaultMethod: 'willToPower', allowedMethods: ['willToPower', 'eternalReturn', 'ubermensch'], args }),
  'school.bergsonism': ({ args }) => callSelectedService({ serviceName: 'bergsonService', defaultMethod: 'duree', allowedMethods: ['duree', 'elanVital', 'intuition'], args }),
  'causality.determination': ({ args }) => callService('causalityService', 'computeNecessity', args),
  'causality.counterfactuals': ({ args }) => callService('causalityService', 'simulateCounterfactual', args),
  'causality.hume-regularity': ({ args }) => callService('causalityService', 'humeRegularity', args),
  'causality.determinism-indeterminism': ({ args }) => callService('causalityService', 'isDeterministic', args.executionRuns || []),
  'causality.free-will': ({ args }) => callService('causalityService', 'assessFreeWill', args),
  'ontology.stances': ({ args }) => callService('ontologyStances', 'classifyTerm', args),
  'process.actuality-potentiality': ({ args }) => callService('processPhilosophyService', 'actualOccasion', args),
  'process.heidegger-dasein': ({ args }) => callService('processPhilosophyService', 'dasein', args),
  'process.deleuze-difference': ({ args }) => callService('processPhilosophyService', 'differenceAndRepetition', args.events || []),
  'process.badiou-event': ({ args }) => callService('contingencyService', 'badiouEvent', args),
  'process.sartrean-existence': ({ args }) => callService('phenomenologyService', 'existencePrecedesEssence', args),
  'time.newtonian': ({ args }) => callService('newtonianService', args.operation || 'tempsAbsolu', args),
  'time.duration': ({ args }) => callService('bergsonService', 'duree', args),
  'time.a-series-b-series': ({ args }) => callService('temporalIdentityService', args.operation || 'aSeriesPosition', args.events || []),
  'time.block-universe': ({ args }) => callService('temporalIdentityService', 'blockUniverse', args),
  'time.arrow': ({ args }) => callService('temporalIdentityService', 'arrowOfTime', args),
  'time.spacetime-relativity': ({ args }) => callService('temporalIdentityService', 'spacetimeRelativity', args),
  'process.bergsonian-vital-impulse': ({ args }) => callService('bergsonService', args.operation || 'elanVital', args),
  'metaphysics.qualia': ({ args }) => callService('consciousnessService', 'recordQualia', args),
  'metaphysics.reference-intentionality': ({ args }) => callService('phenomenologyService', 'intentionality', args),
  'aesthetics.beauty': ({ args }) => callService('aestheticsService', 'evaluateBeauty', args),
  'aesthetics.sublime': ({ args }) => callService('aestheticsService', 'evaluateSublime', args),
  'aesthetics.taste': ({ args }) => callService('aestheticsService', 'evaluateTaste', args),
  'aesthetics.aesthetic-experience': ({ args }) => callService('aestheticsService', 'evaluateAestheticExperience', args),
  'art.definition': ({ args }) => callService('artTheoryService', 'compareArtDefinitions', args),
  'art.significant-form': ({ args }) => callService('artTheoryService', 'evaluateSignificantForm', args),
  'art.institutional-theory': ({ args }) => callService('artTheoryService', 'evaluateInstitutionalContext', args),
  'art.cluster-theory': ({ args }) => callService('artTheoryService', 'compareTheoryCriteria', args),
  'art.open-concept': ({ args }) => callService('artTheoryService', 'evaluateOpenConcept', args),
  'art.definition-enigma': ({ args }) => callService('artTheoryService', 'compareArtDefinitions', args),
  'art.expressionism': ({ args }) => callService('artTheoryService', 'evaluateExpression', args),
  'art.mimesis': ({ args }) => callService('artTheoryService', 'evaluateMimesis', args),
  'art.catharsis': ({ args }) => callService('artTheoryService', 'evaluateMimesis', args),
  'art.formalism': ({ args }) => callService('artTheoryService', 'evaluateSignificantForm', args),
  'art.art-for-art': ({ args }) => callService('artTheoryService', 'evaluateSignificantForm', args),
  'art.representation': ({ args }) => callService('artTheoryService', 'evaluateRepresentation', args),
  'art.symbol-systems': ({ args }) => callService('artTheoryService', 'evaluateRepresentation', args),
  'art.fictionalism': ({ args }) => callService('artTheoryService', 'evaluateFictionalReference', args),
  'art.fictional-reference': ({ args }) => callService('artTheoryService', 'evaluateFictionalReference', args),
  'interpretation.artistic': ({ args }) => callService('interpretationService', 'proposeInterpretations', args),
  'interpretation.esthetic-experience': ({ args }) => callService('interpretationService', 'proposeInterpretations', args),
  'interpretation.embodied-meaning': ({ args }) => callService('interpretationService', 'analyzeEmbodiedMeaning', args),
  'interpretation.intra-extra-artistic': ({ args }) => callService('interpretationService', 'separateEvidence', args),
  'interpretation.indeterminacy': ({ args }) => callService('interpretationService', 'trackIndeterminacy', args),
  'interpretation.construction': ({ args }) => callService('interpretationService', 'analyzeConstruction', args),
  'interpretation.death-of-author': ({ args }) => callService('interpretationService', 'analyzeDeathOfAuthor', args),
  'interpretation.author': ({ args }) => callService('interpretationService', 'analyzeAuthor', args),
  'interpretation.intertextuality': ({ args }) => callService('interpretationService', 'analyzeIntertextuality', args),
  'interpretation.reference': ({ args }) => callService('interpretationService', 'analyzeReference', args),
  'play.play': ({ args }) => callService('playNarrativeService', 'classifyPlayType', args),
  'play.magic-circle': ({ args }) => callService('playNarrativeService', 'assessMagicCircle', args),
  'play.agon': ({ args }) => callService('playNarrativeService', 'evaluatePlayType', { ...args, type: 'agon' }),
  'play.alea': ({ args }) => callService('playNarrativeService', 'evaluatePlayType', { ...args, type: 'alea' }),
  'play.mimicry': ({ args }) => callService('playNarrativeService', 'evaluatePlayType', { ...args, type: 'mimicry' }),
  'play.ilinx': ({ args }) => callService('playNarrativeService', 'evaluatePlayType', { ...args, type: 'ilinx' }),
  'play.serious-games': ({ args }) => callService('playNarrativeService', 'evaluateSeriousGame', args),
  'play.game-studies': ({ args }) => callService('playNarrativeService', 'analyzeGameStudies', args),
  'narrative.fictionality': ({ args }) => callService('playNarrativeService', 'analyzeFictionality', args),
  'narrative.make-believe': ({ args }) => callService('playNarrativeService', 'buildMakeBelieve', args),
  'narrative.props': ({ args }) => callService('playNarrativeService', 'analyzeProps', args),
  'narrative.truth-in-fiction': ({ args }) => callService('playNarrativeService', 'assessTruthInFiction', args),
  'narrative.fictional-discourse': ({ args }) => callService('playNarrativeService', 'analyzeFictionalDiscourse', args),
  'narrative.narration': ({ args }) => callService('playNarrativeService', 'analyzeNarration', args),
  'narrative.literature': ({ args }) => callService('playNarrativeService', 'analyzeLiterature', args),
  'narrative.novel': ({ args }) => callService('playNarrativeService', 'analyzeNovel', args),
  'cinema.cinematic-signification': ({ args }) => callService('cinemaMusicService', 'analyzeCinematicSignification', args),
  'cinema.movement-image': ({ args }) => callService('cinemaMusicService', 'evaluateMovementImage', args),
  'cinema.time-image': ({ args }) => callService('cinemaMusicService', 'evaluateTimeImage', args),
  'cinema.crystal-image': ({ args }) => callService('cinemaMusicService', 'evaluateCrystalImage', args),
  'cinema.mechanical-reproduction': ({ args }) => callService('cinemaMusicService', 'assessMechanicalReproduction', args),
  'cinema.aura': ({ args }) => callService('cinemaMusicService', 'assessAura', args),
  'cinema.film-narration': ({ args }) => callService('cinemaMusicService', 'analyzeFilmNarration', args),
  'cinema.cognitive-theory': ({ args }) => callService('cinemaMusicService', 'evaluateCognitiveReception', args),
  'cinema.ordinary-language': ({ args }) => callService('cinemaMusicService', 'analyzeOrdinaryLanguage', args),
  'music.musically-beautiful': ({ args }) => callService('cinemaMusicService', 'analyzeMusicalForm', args),
  'music.formalism': ({ args }) => callService('cinemaMusicService', 'analyzeMusicalForm', args),
  'music.expression': ({ args }) => callService('cinemaMusicService', 'evaluateMusicalExpression', args),
  'music.emotion': ({ args }) => callService('cinemaMusicService', 'assessMusicalEmotion', args),
  'music.tension-expectation': ({ args }) => callService('cinemaMusicService', 'analyzeTensionExpectation', args),
  'music.autonomous-art': ({ args }) => callService('cinemaMusicService', 'assessAutonomy', args),
  'music.culture-industry': ({ args }) => callService('cinemaMusicService', 'assessCultureIndustry', args),
  'school.merleau-ponty': ({ args }) => callService('phenomenologyService', 'perception', args),
  'ethics.act-utilitarianism': ({ args }) => callService('normativeEthicsService', 'evaluateActUtilitarianism', args),
  'ethics.rule-utilitarianism': ({ args }) => callService('normativeEthicsService', 'evaluateRuleUtilitarianism', args),
  'ethics.categorical-imperative': ({ args }) => callService('normativeEthicsService', 'evaluateCategoricalImperative', args),
  'ethics.double-effect': ({ args }) => callService('normativeEthicsService', 'evaluateDoubleEffect', args),
  'ethics.virtue-ethics': ({ args }) => callService('normativeEthicsService', 'assessVirtueEthics', args),
  'ethics.rawlsian-justice': ({ args }) => callService('justiceEthicsService', 'evaluateRawlsianJustice', args),
  'ethics.distributive-justice': ({ args }) => callService('justiceEthicsService', 'evaluateDistributiveJustice', args),
  'ethics.natural-rights': ({ args }) => callService('justiceEthicsService', 'evaluateRights', args),
  'ethics.libertarianism': ({ args }) => callService('justiceEthicsService', 'evaluateLibertarianEntitlement', args),
  'ethics.care-ethics': ({ args }) => callService('relationalEthicsService', 'assessCare', args),
  'ethics.care-deontology': ({ args }) => callService('relationalEthicsService', 'evaluateCareDuty', args),
  'ethics.responsibility-other': ({ args }) => callService('relationalEthicsService', 'evaluateResponsibilityForOther', args),
  'ethics.social-contract': ({ args }) => callService('justiceEthicsService', 'evaluateSocialContract', args),
  'politics.regime-classification': ({ args }) => callService('politicalPhilosophyService', 'classifyRegime', args),
  'politics.legitimacy': ({ args }) => callService('politicalPhilosophyService', 'assessLegitimacy', args),
  'politics.social-contract': ({ args }) => callService('politicalPhilosophyService', 'analyzeSocialContract', args),
  'politics.liberty-authority': ({ args }) => callService('politicalPhilosophyService', 'compareLibertyAuthority', args),
  'politics.separation-of-powers': ({ args }) => callService('politicalPhilosophyService', 'assessPowerSeparation', args),
  'politics.democratic-participation': ({ args }) => callService('politicalPhilosophyService', 'analyzeDemocraticParticipation', args),
  'politics.pluralism': ({ args }) => callService('politicalPhilosophyService', 'assessPluralism', args),
  'politics.civil-disobedience': ({ args }) => callService('politicalPhilosophyService', 'assessCivilDisobedience', args),
  'politics.security-liberty-surveillance': ({ args }) => callService('politicalPhilosophyService', 'assessSurveillanceLiberty', args),
  'politics.liberalism': ({ args }) => callService('politicalPhilosophyService', 'assessLiberalism', args),
  'politics.conservatism': ({ args }) => callService('politicalPhilosophyService', 'assessConservatism', args),
  'politics.socialism-marxism': ({ args }) => callService('politicalPhilosophyService', 'analyzeMarxism', args),
  'politics.feminism': ({ args }) => callService('politicalPhilosophyService', 'assessFeminism', args),
  'ethics.environmental-ethics': ({ args }) => callService('environmentalEthicsService', 'assessEcologicalPerspective', args),
  'ethics.animal-rights': ({ args }) => callService('environmentalEthicsService', 'assessAnimalInterests', args),
  'ethics.sustainability': ({ args }) => callService('environmentalEthicsService', 'assessSustainability', args),
  'ethics.precautionary-principle': ({ args }) => callService('environmentalEthicsService', 'assessPrecaution', args),
  'ethics.externalities': ({ args }) => callService('environmentalEthicsService', 'assessExternality', args),
  'ethics.commons': ({ args }) => callService('environmentalEthicsService', 'assessCommons', args),
};

function evaluateConcept(args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('evaluateConcept arguments must be an object.');
  }
  const concept = requireConcept(args.concept);
  if (!['implemented', 'partial'].includes(concept.status)) return unavailable(concept);
  const adapter = ADAPTERS[concept.id];
  if (!adapter) return unavailable(concept);
  return {
    concept: concept.id,
    status: concept.status,
    executable: true,
    supported: true,
    result: copy(adapter({ args })),
    limitation: concept.status === 'partial' ? 'Analyse opérationnelle partielle ; elle ne constitue pas une preuve de vérité.' : null,
  };
}

async function queryOntology(args = {}) {
  const operation = args.ontologyOperation || args.operationName;
  if (!operation) throw new Error('queryOntology requires ontologyOperation.');
  const result = await ontologyRouter.handleOntologyRequest({
    request: { operation, arguments: args.ontologyArguments || {} },
    orchestratorId: args.orchestratorId,
  });
  return { operation, result };
}

async function handlePhilosophyRequest({ request } = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Philosophy request must be an object.');
  }
  const operation = String(request.operation || '').trim();
  if (!OPERATIONS.includes(operation)) throw new Error(`Unknown philosophy operation '${operation}'.`);
  const args = request.arguments && typeof request.arguments === 'object' ? request.arguments : {};
  if (operation === 'listConcepts') return { concepts: listConcepts(args) };
  if (operation === 'getConcept') return { concept: requireConcept(args.conceptId || args.id) };
  if (operation === 'registryHealth') return registryHealth();
  if (operation === 'evaluateConcept') return evaluateConcept(args);
  if (operation === 'applyRuntimeEffect') return runtimeEffects.applyRuntimeEffect(args);
  if (operation === 'listRelations') return { relations: listRelations(args) };
  if (operation === 'getNeighborhood') return getNeighborhood(args.conceptId || args.id, args);
  if (operation === 'exportGraph') return exportGraph(args);
  if (operation === 'compareEthicalFrameworks') return ethicalComparison.compareEthicalFrameworks(args);
  return queryOntology(args);
}

module.exports = {
  OPERATIONS,
  handlePhilosophyRequest,
  listConcepts,
  getConcept,
  listRelations,
  getNeighborhood,
  exportGraph,
  registryHealth
};
