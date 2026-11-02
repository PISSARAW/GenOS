'use strict';

const dialect = require('../communication/dialectService');
const ground = require('../communication/commonGroundService');
const { digest } = require('../evidenceProtocol/canonical');
const { validateContext } = require('./contract');
const { copy, validateConfiguredState } = require('./contextOperations');

function now(clock) {
  const value = clock();
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('SYNAPSE local clock invalid.');
  return parsed;
}

function expired(value, clock) {
  if (value === null) return false;
  const text = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const deadline = Date.parse(text);
  return !Number.isFinite(deadline) || deadline <= now(clock);
}

async function nativeDictionary(db, input) {
  try { return await dialect.getDialect({ db, dialectId: input.dialectId }); }
  catch (error) { if (error.message.startsWith('UNKNOWN_DIALECT:')) return null; throw error; }
}

async function capture(codec, input) {
  const local = copy(input);
  const state = validateConfiguredState(local.state, codec.configuration);
  const snapshot = await nativeDictionary(codec.db, local);
  const entries = await ground.getSharedGround({ db: codec.db, agentA: local.publisher.agentId,
    agentB: local.audience[0].agentId, domain: local.domain });
  const supported = new Set(codec.configuration.config.operations.map(entry => entry.semanticFingerprint));
  return validateContext({ contextId: local.contextId, domain: local.domain, publisher: local.publisher,
    audience: local.audience, base: { stateDigest: digest(state), generation: local.generation },
    schema: codec.configuration.schemaRef,
    dictionary: { snapshot, digest: snapshot ? digest(snapshot) : null },
    grounding: entries.filter(entry => supported.has(entry.semanticFingerprint)), dependencies: local.dependencies });
}

module.exports = { now, expired, nativeDictionary, capture };
