'use strict';

const ontologyService = require('./ontologyService');
const ontologyRelations = require('./ontologyRelations');
const semanticReference = require('./philosophy/semanticReferenceService');
const contextService = require('./philosophy/contextService');
const speechAct = require('./philosophy/speechActService');
const pragmatics = require('./philosophy/pragmaticsService');
const categorization = require('./philosophy/categorizationService');
const languageGame = require('./philosophy/languageGameService');
const discourse = require('./philosophy/discourseService');
const semiotics = require('./philosophy/semioticsService');
const poetics = require('./philosophy/poeticsService');
const deconstruction = require('./philosophy/deconstructionService');
const hermeneutics = require('./philosophy/hermeneuticsService');
const differenceOntology = require('./philosophy/differenceOntologyService');
const provenance = require('./philosophy/provenanceService');

function requireAgentId(args, operation) {
  const agentId = args.agentId || args.beingId || args.id || '';
  if (!agentId || typeof agentId !== 'string') {
    throw new Error(`${operation} requires a valid agentId.`);
  }
  return agentId;
}

function requireString(args, key, operation) {
  const value = args[key];
  if (!value || typeof value !== 'string') {
    throw new Error(`${operation} requires a valid ${key}.`);
  }
  return value;
}

async function getBeing(args) {
  const agentId = requireAgentId(args, 'getBeing');
  const being = await ontologyService.getBeing(agentId);
  return being ? { found: true, being } : { found: false, agentId };
}

async function listBeings(args) {
  const filters = args.filters && typeof args.filters === 'object' ? args.filters : {};
  const beings = await ontologyService.listBeings(filters);
  return { count: beings.length, beings };
}

async function defineBeing(args) {
  const agentId = requireAgentId(args, 'defineBeing');
  const substance = args.substance && typeof args.substance === 'object' ? args.substance : {};
  return { defined: true, being: await ontologyService.defineBeing(agentId, substance) };
}

async function getAttributes(args) {
  const agentId = requireAgentId(args, 'getAttributes');
  return { agentId, attributes: await ontologyService.getAttributes(agentId) };
}

async function getAttribute(args) {
  const agentId = requireAgentId(args, 'getAttribute');
  const key = requireString(args, 'key', 'getAttribute');
  return { agentId, key, attribute: await ontologyService.getAttribute(agentId, key) };
}

async function setAttribute(args) {
  const agentId = requireAgentId(args, 'setAttribute');
  const key = requireString(args, 'key', 'setAttribute');
  if (args.value === undefined || args.value === null) throw new Error('setAttribute requires a value.');
  const result = await ontologyService.setAttribute({
    agentId, key, value: args.value,
    modality: args.modality || 'accidental', provenance: args.provenance || 'ontological',
  });
  return { set: true, ...result };
}

async function getModes(args) {
  const agentId = requireAgentId(args, 'getModes');
  return { agentId, modes: await ontologyService.getModes(agentId) };
}

async function defineMode(args) {
  const agentId = requireAgentId(args, 'defineMode');
  const mode = requireString(args, 'mode', 'defineMode');
  const defined = await ontologyService.defineMode(agentId, mode, {
    constraint: args.constraint || 'possible', activationCondition: args.activationCondition || null,
  });
  return { defined: true, mode: defined };
}

async function activateMode(args) {
  const agentId = requireAgentId(args, 'activateMode');
  const mode = requireString(args, 'mode', 'activateMode');
  return { activated: true, mode: await ontologyService.activateMode(agentId, mode) };
}

async function deactivateMode(args) {
  const agentId = requireAgentId(args, 'deactivateMode');
  const mode = requireString(args, 'mode', 'deactivateMode');
  return { deactivated: true, mode: await ontologyService.deactivateMode(agentId, mode, { reason: args.reason || null }) };
}

async function getActiveHypostatizations(args) {
  const agentId = requireAgentId(args, 'getActiveHypostatizations');
  return { agentId, hypostases: await ontologyService.getActiveHypostatizations(agentId) };
}

async function hypostatize(args) {
  const agentId = requireAgentId(args, 'hypostatize');
  const attributeKey = args.attributeKey || args.key || args.attribute || '';
  if (!attributeKey || typeof attributeKey !== 'string') throw new Error('hypostatize requires a valid attributeKey (or key/attribute).');
  const hypostasis = await ontologyService.hypostatize(agentId, attributeKey, {
    hypostasisType: args.hypostasisType || args.type || 'worker_spawn',
    targetConfig: args.targetConfig && typeof args.targetConfig === 'object' ? args.targetConfig : {},
  });
  return { hypostatized: true, ...hypostasis };
}

async function checkIdentityContinuity(args) {
  const agentId = requireAgentId(args, 'checkIdentityContinuity');
  return { agentId, ...await ontologyService.checkIdentityContinuity(agentId) };
}

async function getIdentityHistory(args) {
  const agentId = requireAgentId(args, 'getIdentityHistory');
  return { agentId, events: await ontologyService.getIdentityHistory(agentId, { limit: Number(args.limit) || 50 }) };
}

const HANDLERS = {
  getBeing, listBeings, defineBeing, getAttributes, getAttribute, setAttribute, getModes,
  defineMode, activateMode, deactivateMode, getActiveHypostatizations, hypostatize,
  checkIdentityContinuity, getIdentityHistory,
  addRelation: args => ontologyRelations.addRelation(args).then(relation => ({ added: true, relation })),
  getRelations: args => ontologyRelations.getRelations(args).then(relations => ({ relations })),
  analyzeExpression: args => semanticReference.analyzeExpression(args),
  resolveReference: args => semanticReference.resolveReference(args),
  evaluateDefiniteDescription: args => semanticReference.evaluateDefiniteDescription(args),
  resolveIndexical: args => contextService.resolveIndexical(args),
  createContext: args => contextService.createContext(args),
  analyzeSpeechAct: args => speechAct.analyzeSpeechAct(args),
  analyzeImplicature: args => pragmatics.analyzeImplicature(args),
  assessMaxims: args => pragmatics.assessMaxims(args),
  classifyConcept: args => categorization.classifyConcept(args),
  createLanguageGame: args => languageGame.createLanguageGame(args),
  evaluateLanguageMove: args => languageGame.evaluateMove(args),
  assessRuleFollowing: args => languageGame.assessRuleFollowing(args),
  analyzePrivateLanguage: args => languageGame.analyzePrivateLanguage(args),
  analyzeReportedSpeech: args => discourse.analyzeReportedSpeech(args),
  analyzeDiscourse: args => discourse.analyzeDiscourse(args),
  analyzeSign: args => semiotics.analyzeSign(args),
  analyzeBinaryOpposition: args => semiotics.analyzeBinaryOpposition(args),
  analyzePoeticMessage: args => poetics.analyzeMessage(args),
  analyzeDeconstruction: args => deconstruction.analyzeText(args),
  analyzeLogocentrism: args => deconstruction.analyzeLogocentrism(args),
  analyzeAutoimmunity: args => deconstruction.analyzeAutoimmunity(args),
  interpretHermeneutically: args => hermeneutics.interpret(args),
  analyzeSuspicion: args => hermeneutics.analyzeSuspicion(args),
  analyzeNarrative: args => hermeneutics.analyzeNarrative(args),
  analyzeDifference: args => differenceOntology.analyzeDifference(args),
  analyzeRepetition: args => differenceOntology.analyzeRepetition(args),
  createRhizome: args => differenceOntology.createRhizome(args),
  analyzeAssemblage: args => differenceOntology.analyzeAssemblage(args),
  mapTerritorialization: args => differenceOntology.mapTerritorialization(args),
  createProvenanceRecord: args => provenance.createRecord(args),
  nextProvenanceVersion: args => ({ version: provenance.nextVersion(args.version) }),
  validateProvenanceChain: args => provenance.validateChain(args.records),
};

module.exports = { HANDLERS, KNOWN_OPERATIONS: new Set(Object.keys(HANDLERS)) };
