'use strict';

const { validateRegistry, registryHealth: conceptRegistryHealth } = require('../philosophy/conceptRegistry');
const ontologyRouter = require('./ontologyRouter');

const registry = validateRegistry();
const definitions = registry.concepts;

const OPERATIONS = Object.freeze([
  'listConcepts', 'getConcept', 'registryHealth', 'evaluateConcept', 'queryOntology'
]);
const conceptMap = new Map(definitions.map((concept) => [concept.id, concept]));

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function listConcepts(args = {}) {
  return definitions
    .filter((concept) => !args.domain || concept.domain === args.domain)
    .filter((concept) => !args.school || concept.school === args.school)
    .filter((concept) => !args.status || concept.status === args.status)
    .map(copy);
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

const ADAPTERS = {
  'school.platonism': ({ args }) => callService('platonismService', 'getFormIdeal', args.formName || 'perfect_agent'),
  'school.aristotelianism': ({ args }) => callService('aristotelianService', 'categorize', { agent: args.agent }),
  'school.stoicism': ({ args }) => callService('stoicismService', 'isMonist', { agent: args.agent }),
  'school.epicureanism': ({ args }) => callService('epicureanService', 'atomSchema', { agent: args.agent }),
  'school.cartesianism': ({ args }) => callService('cartesianService', 'dualism', { agent: args.agent }),
  'school.leibnizianism': ({ args }) => callService('leibnizianService', 'monadologie', { agent: args.agent }),
  'school.spinozism': ({ args }) => callService('spinozaService', 'substanceUnique', { system: args.system || { agents: [] } }),
  'school.newtonianism': ({ args }) => callService('newtonianService', args.operation || 'espaceAbsolu', args),
  'school.kantianism': ({ args }) => callService('kantianService', args.operation || 'categoriesAPriori', args),
  'school.hegelianism': ({ args }) => callService('hegelianService', args.operation || 'absoluteGeist', args),
  'school.schopenhauer': ({ args }) => callService('schopenhauerService', args.operation || 'willRepresentation', args),
  'school.nietzsche': ({ args }) => callService('nietzscheService', args.operation || 'willToPower', args),
  'school.bergsonism': ({ args }) => callService('bergsonService', args.operation || 'duree', args),
  'causality.determination': ({ args }) => callService('causalityService', 'computeNecessity', args),
  'causality.counterfactuals': ({ args }) => callService('causalityService', 'simulateCounterfactual', args),
  'ontology.stances': ({ args }) => callService('ontologyStances', 'classifyTerm', args),
  'process.actuality-potentiality': ({ args }) => callService('processPhilosophyService', 'actualOccasion', args),
  'process.heidegger-dasein': ({ args }) => callService('processPhilosophyService', 'dasein', args),
  'process.deleuze-difference': ({ args }) => callService('processPhilosophyService', 'differenceAndRepetition', args.events || []),
  'process.badiou-event': ({ args }) => callService('contingencyService', 'badiouEvent', args),
  'process.sartrean-existence': ({ args }) => callService('phenomenologyService', 'existencePrecedesEssence', args),
  'time.newtonian': ({ args }) => callService('newtonianService', args.operation || 'tempsAbsolu', args),
  'time.duration': ({ args }) => callService('bergsonService', 'duree', args),
  'process.bergsonian-vital-impulse': ({ args }) => callService('bergsonService', args.operation || 'elanVital', args),
  'metaphysics.qualia': ({ args }) => callService('consciousnessService', 'recordQualia', args),
  'metaphysics.reference-intentionality': ({ args }) => callService('phenomenologyService', 'intentionality', args),
};

function evaluateConcept(args) {
  const concept = requireConcept(args.concept);
  if (concept.status !== 'implemented') return unavailable(concept);
  const adapter = ADAPTERS[concept.id];
  if (!adapter) return unavailable(concept);
  return { concept: concept.id, status: concept.status, executable: true, supported: true, result: copy(adapter({ args })) };
}

async function queryOntology(args) {
  const operation = args.ontologyOperation || args.operationName;
  if (!operation) throw new Error('queryOntology requires ontologyOperation.');
  const result = await ontologyRouter.handleOntologyRequest({
    request: { operation, arguments: args.ontologyArguments || {} },
    orchestratorId: args.orchestratorId,
  });
  return { operation, result };
}

async function handlePhilosophyRequest({ request }) {
  const operation = String(request.operation || '').trim();
  if (!OPERATIONS.includes(operation)) throw new Error(`Unknown philosophy operation '${operation}'.`);
  const args = request.arguments && typeof request.arguments === 'object' ? request.arguments : {};
  if (operation === 'listConcepts') return { concepts: listConcepts(args) };
  if (operation === 'getConcept') return { concept: requireConcept(args.conceptId || args.id) };
  if (operation === 'registryHealth') return registryHealth();
  if (operation === 'evaluateConcept') return evaluateConcept(args);
  return queryOntology(args);
}

module.exports = { OPERATIONS, handlePhilosophyRequest, listConcepts, getConcept, registryHealth };
