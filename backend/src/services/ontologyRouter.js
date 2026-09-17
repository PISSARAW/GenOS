'use strict';

/**
 * Ontology Router — thin dispatcher between orchestrator actions / MCP tools
 * and the ontology service.
 *
 * Follows the same shape as handleOrganizationRead / handlePrimitive:
 * one handler function that receives { db?, request, orchestratorId },
 * deduces the requester, delegates to ontologyService, and returns a plain
 * result object that the caller serializes to stdout.
 */

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

const KNOWN_OPERATIONS = new Set([
  // Being
  'getBeing',
  'listBeings',
  'defineBeing',
  // Attributes
  'getAttributes',
  'getAttribute',
  'setAttribute',
  // Modes
  'getModes',
  'defineMode',
  'activateMode',
  'deactivateMode',
  // Hypostatization
  'getActiveHypostatizations',
  'hypostatize',
  // Identity
  'checkIdentityContinuity',
  'getIdentityHistory',
  'addRelation',
  'getRelations',
  'analyzeExpression',
  'resolveReference',
  'evaluateDefiniteDescription',
  'resolveIndexical',
  'createContext',
  'analyzeSpeechAct',
  'analyzeImplicature',
  'assessMaxims',
  'classifyConcept',
  'createLanguageGame',
  'evaluateLanguageMove',
  'assessRuleFollowing',
  'analyzePrivateLanguage',
  'analyzeReportedSpeech',
  'analyzeDiscourse',
  'analyzeSign',
  'analyzeBinaryOpposition',
  'analyzePoeticMessage',
  'analyzeDeconstruction',
  'analyzeLogocentrism',
  'analyzeAutoimmunity',
  'interpretHermeneutically',
  'analyzeSuspicion',
  'analyzeNarrative',
  'analyzeDifference',
  'analyzeRepetition',
  'createRhizome',
  'analyzeAssemblage',
  'mapTerritorialization',
]);

function normalizeArgs(request) {
  const args = request.arguments && typeof request.arguments === 'object' ? request.arguments : {};
  return args;
}

function dedupeResult(raw) {
  // Keep the service's return value as-is; just ensure the caller always
  // gets a serializable plain object/array.
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map(dedupeResult);
  if (typeof raw !== 'object') return raw;
  return raw;
}

/**
 * @param {object} context
 * @param {object} [context.db]        - optional, used by some operations if they
 *                                       need a direct handle (most don't, the service
 *                                       manages its own singleton).
 * @param {object} context.request     - MCP / CLI request payload.
 * @param {string} context.orchestratorId
 * @returns {Promise<object>} plain serializable result
 */
async function handleOntologyRequest({ request, orchestratorId }) {
  const operation = String(request.operation || '').trim();
  if (!operation) {
    throw new Error('ontology operation is required.');
  }
  if (!KNOWN_OPERATIONS.has(operation)) {
    throw new Error(`Unknown ontology operation '${operation}'. Known: ${[...KNOWN_OPERATIONS].join(', ')}`);
  }

  const args = normalizeArgs(request);

  switch (operation) {
    // ------------------------------------------------------------------
    // Being
    // ------------------------------------------------------------------
    case 'getBeing': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('getBeing requires a valid agentId (or beingId/id).');
      }
      const being = await ontologyService.getBeing(agentId);
      if (!being) {
        return { found: false, agentId };
      }
      return { found: true, being };
    }

    case 'listBeings': {
      const filters = args.filters && typeof args.filters === 'object' ? args.filters : {};
      const beings = await ontologyService.listBeings(filters);
      return { count: beings.length, beings };
    }

    case 'defineBeing': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('defineBeing requires a valid agentId.');
      }
      const substance = args.substance && typeof args.substance === 'object' ? args.substance : {};
      const being = await ontologyService.defineBeing(agentId, substance);
      return { defined: true, being };
    }

    // ------------------------------------------------------------------
    // Attributes
    // ------------------------------------------------------------------
    case 'getAttributes': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('getAttributes requires a valid agentId.');
      }
      const attrs = await ontologyService.getAttributes(agentId);
      return { agentId, attributes: attrs };
    }

    case 'getAttribute': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('getAttribute requires a valid agentId.');
      }
      const key = args.key;
      if (!key || typeof key !== 'string') {
        throw new Error('getAttribute requires a valid key.');
      }
      const attr = await ontologyService.getAttribute(agentId, key);
      return { agentId, key, attribute: attr };
    }

    case 'setAttribute': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('setAttribute requires a valid agentId.');
      }
      const key = args.key;
      if (!key || typeof key !== 'string') {
        throw new Error('setAttribute requires a valid key.');
      }
      const value = args.value;
      if (value === undefined || value === null) {
        throw new Error('setAttribute requires a value.');
      }
      const modality = args.modality || 'accidental';
      const provenance = args.provenance || 'ontological';
      const result = await ontologyService.setAttribute({ agentId, key, value, modality, provenance });
      return { set: true, ...result };
    }

    // ------------------------------------------------------------------
    // Modes
    // ------------------------------------------------------------------
    case 'getModes': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('getModes requires a valid agentId.');
      }
      const modes = await ontologyService.getModes(agentId);
      return { agentId, modes };
    }

    case 'defineMode': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('defineMode requires a valid agentId.');
      }
      const mode = args.mode;
      if (!mode || typeof mode !== 'string') {
        throw new Error('defineMode requires a valid mode.');
      }
      const constraint = args.constraint || 'possible';
      const activationCondition = args.activationCondition || null;
      const defined = await ontologyService.defineMode(agentId, mode, { constraint, activationCondition });
      return { defined: true, mode: defined };
    }

    case 'activateMode': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('activateMode requires a valid agentId.');
      }
      const mode = args.mode;
      if (!mode || typeof mode !== 'string') {
        throw new Error('activateMode requires a valid mode.');
      }
      const activated = await ontologyService.activateMode(agentId, mode);
      return { activated: true, mode: activated };
    }

    case 'deactivateMode': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('deactivateMode requires a valid agentId.');
      }
      const mode = args.mode;
      if (!mode || typeof mode !== 'string') {
        throw new Error('deactivateMode requires a valid mode.');
      }
      const reason = args.reason || null;
      const deactivated = await ontologyService.deactivateMode(agentId, mode, { reason });
      return { deactivated: true, mode: deactivated };
    }

    // ------------------------------------------------------------------
    // Hypostatization
    // ------------------------------------------------------------------
    case 'getActiveHypostatizations': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('getActiveHypostatizations requires a valid agentId.');
      }
      const hypostases = await ontologyService.getActiveHypostatizations(agentId);
      return { agentId, hypostases };
    }

    case 'hypostatize': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('hypostatize requires a valid agentId.');
      }
      const attributeKey = args.attributeKey || args.key || args.attribute || '';
      if (!attributeKey || typeof attributeKey !== 'string') {
        throw new Error('hypostatize requires a valid attributeKey (or key/attribute).');
      }
      const hypostasisType = args.hypostasisType || args.type || 'worker_spawn';
      const targetConfig = args.targetConfig && typeof args.targetConfig === 'object' ? args.targetConfig : {};
      const hypostasis = await ontologyService.hypostatize(agentId, attributeKey, { hypostasisType, targetConfig });
      return { hypostatized: true, ...hypostasis };
    }

    // ------------------------------------------------------------------
    // Identity
    // ------------------------------------------------------------------
    case 'checkIdentityContinuity': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('checkIdentityContinuity requires a valid agentId.');
      }
      const continuity = await ontologyService.checkIdentityContinuity(agentId);
      return { agentId, ...continuity };
    }

    case 'getIdentityHistory': {
      const agentId = args.agentId || args.beingId || args.id || '';
      if (!agentId || typeof agentId !== 'string') {
        throw new Error('getIdentityHistory requires a valid agentId.');
      }
      const limit = Number(args.limit) || 50;
      const events = await ontologyService.getIdentityHistory(agentId, { limit });
      return { agentId, events };
    }

    case 'addRelation':
      return { added: true, relation: await ontologyRelations.addRelation(args) };

    case 'getRelations':
      return { relations: await ontologyRelations.getRelations(args) };

    case 'analyzeExpression':
      return semanticReference.analyzeExpression(args);
    case 'resolveReference':
      return semanticReference.resolveReference(args);
    case 'evaluateDefiniteDescription':
      return semanticReference.evaluateDefiniteDescription(args);
    case 'resolveIndexical':
      return contextService.resolveIndexical(args);
    case 'createContext':
      return contextService.createContext(args);
    case 'analyzeSpeechAct':
      return speechAct.analyzeSpeechAct(args);
    case 'analyzeImplicature':
      return pragmatics.analyzeImplicature(args);
    case 'assessMaxims':
      return pragmatics.assessMaxims(args);
    case 'classifyConcept':
      return categorization.classifyConcept(args);
    case 'createLanguageGame':
      return languageGame.createLanguageGame(args);
    case 'evaluateLanguageMove':
      return languageGame.evaluateMove(args);
    case 'assessRuleFollowing':
      return languageGame.assessRuleFollowing(args);
    case 'analyzePrivateLanguage':
      return languageGame.analyzePrivateLanguage(args);
    case 'analyzeReportedSpeech':
      return discourse.analyzeReportedSpeech(args);
    case 'analyzeDiscourse':
      return discourse.analyzeDiscourse(args);
    case 'analyzeSign':
      return semiotics.analyzeSign(args);
    case 'analyzeBinaryOpposition':
      return semiotics.analyzeBinaryOpposition(args);
    case 'analyzePoeticMessage':
      return poetics.analyzeMessage(args);
    case 'analyzeDeconstruction':
      return deconstruction.analyzeText(args);
    case 'analyzeLogocentrism':
      return deconstruction.analyzeLogocentrism(args);
    case 'analyzeAutoimmunity':
      return deconstruction.analyzeAutoimmunity(args);
    case 'interpretHermeneutically':
      return hermeneutics.interpret(args);
    case 'analyzeSuspicion':
      return hermeneutics.analyzeSuspicion(args);
    case 'analyzeNarrative':
      return hermeneutics.analyzeNarrative(args);
    case 'analyzeDifference':
      return differenceOntology.analyzeDifference(args);
    case 'analyzeRepetition':
      return differenceOntology.analyzeRepetition(args);
    case 'createRhizome':
      return differenceOntology.createRhizome(args);
    case 'analyzeAssemblage':
      return differenceOntology.analyzeAssemblage(args);
    case 'mapTerritorialization':
      return differenceOntology.mapTerritorialization(args);

    default:
      // Defensive: keep the switch exhaustive for future operations.
      throw new Error(`Unhandled ontology operation '${operation}'.`);
  }
}

module.exports = {
  KNOWN_OPERATIONS,
  handleOntologyRequest,
};
