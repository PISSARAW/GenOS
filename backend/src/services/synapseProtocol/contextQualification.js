'use strict';

const dialect = require('../communication/dialectService');
const { digest } = require('../evidenceProtocol/canonical');
const { expired } = require('./contextCapture');
const { fail, normalizeOperations, payloadOperation } = require('./contextOperations');

const same = (left, right) => digest(left) === digest(right);

function provenance(entry, config) {
  const requirements = Object.entries(config.groundingProvenance);
  return requirements.every(([key, value]) => Object.hasOwn(entry.provenance, key) && same(entry.provenance[key], value));
}

function groundEntry(entry, context, codec) {
  const pair = [context.publisher.agentId, context.audience[0].agentId].sort();
  return same([entry.agentA, entry.agentB], pair) && entry.domain === context.domain && entry.status === 'grounded'
    && !expired(entry.expiresAt, codec.clock) && entry.confidence >= codec.configuration.config.minimumGroundConfidence
    && provenance(entry, codec.configuration.config);
}

function grounding(remote, local, codec) {
  const remoteEntries = new Map(remote.grounding.map(entry => [entry.semanticFingerprint, entry]));
  const localEntries = new Map(local.grounding.map(entry => [entry.semanticFingerprint, entry]));
  if (remoteEntries.size !== remote.grounding.length || localEntries.size !== local.grounding.length) return false;
  for (const mapping of codec.configuration.config.operations) {
    const offered = remoteEntries.get(mapping.semanticFingerprint);
    const held = localEntries.get(mapping.semanticFingerprint);
    if (!offered || !held || !groundEntry(offered, remote, codec) || !groundEntry(held, local, codec)) return false;
    if (held.confidence < offered.confidence) return false;
  }
  return true;
}

function compareContexts(remote, local, codec) {
  const missing = [];
  for (const key of ['contextId', 'domain', 'publisher', 'audience', 'base', 'schema', 'dependencies']) {
    if (!same(remote[key], local[key])) missing.push(key);
  }
  if (!grounding(remote, local, codec)) missing.push('grounding');
  const source = remote.dictionary.snapshot;
  const target = local.dictionary.snapshot;
  if (!source || !target || !same(remote.dictionary, local.dictionary)) missing.push('dictionary');
  else if (expired(source.expiresAt, codec.clock) || expired(target.expiresAt, codec.clock)) missing.push('dictionary');
  return missing;
}

function mappingFor(decoded, codec) {
  const mapping = [...codec.configuration.mappings.values()].find(entry => entry.semanticFingerprint === decoded.semanticFingerprint);
  if (!mapping || mapping.canonicalMeaning !== decoded.canonicalMeaning || !same(mapping.payloadSchema, decoded.payloadSchema)) return null;
  return mapping;
}

async function decodeOperations(codec, representation, context) {
  const snapshot = context.dictionary.snapshot;
  const operations = [];
  try {
    for (const encoded of representation.operations) {
      const decoded = await dialect.decode({ db: codec.db, dialectId: snapshot.dialectId,
        symbol: encoded.symbol, version: snapshot.version });
      const mapping = mappingFor(decoded, codec);
      if (!mapping) return null;
      if (!mapping.validate(encoded.payload)) fail('SYNAPSE decoded payload violates the local operation schema.');
      operations.push(payloadOperation(mapping, encoded.payload));
    }
  } catch (error) {
    if (/^UNKNOWN_(?:DIALECT|SYMBOL)/.test(error.message)) return null;
    throw error;
  }
  return normalizeOperations(operations);
}

module.exports = { same, compareContexts, decodeOperations, mappingFor };
