'use strict';

const crypto = require('node:crypto');

const SPLITS = Object.freeze(['train', 'dev', 'reserved']);

function protocolError(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function hashManifest(manifest) {
  return crypto.createHash('sha256').update(stableJson(manifest)).digest('hex');
}

function listIds(items, split) {
  if (!Array.isArray(items) || items.length === 0) protocolError('INVALID_SPLIT', `${split} must be a non-empty list`);
  const ids = items.map((item) => item && item.id);
  if (ids.some((id) => typeof id !== 'string' || id.trim() === '')) protocolError('INVALID_CORPUS_ID', `${split} contains an item without a stable id`);
  if (new Set(ids).size !== ids.length) protocolError('DUPLICATE_CORPUS_ID', `${split} contains duplicate ids`);
  return ids;
}

function validateDisjointSplits(corpus) {
  const seen = new Map();
  for (const split of SPLITS) {
    for (const id of listIds(corpus[split], split)) {
      if (seen.has(id)) protocolError('CORPUS_LEAK', `Corpus item ${id} appears in ${seen.get(id)} and ${split}`);
      seen.set(id, split);
    }
  }
  return Object.fromEntries(SPLITS.map((split) => [split, corpus[split].length]));
}

function validateCriteria(criteria) {
  if (!criteria || typeof criteria !== 'object' || !criteria.primaryMetric || !['higher', 'lower'].includes(criteria.direction)) protocolError('INVALID_CRITERIA', 'primaryMetric and direction are required');
  if (!Number.isFinite(criteria.threshold)) protocolError('INVALID_CRITERIA', 'criteria.threshold must be numeric');
}

function validateIdentity(input) {
  if (!input || typeof input !== 'object') protocolError('INVALID_PROTOCOL', 'Protocol object is required');
  if (!input.protocolId || !input.hypothesis) protocolError('INVALID_PROTOCOL', 'protocolId and hypothesis are required');
  if (!input.revision || typeof input.revision !== 'string') protocolError('INVALID_PROTOCOL', 'revision is required');
}

function validateSeeds(seeds) {
  if (!Array.isArray(seeds) || seeds.length < 2) protocolError('INVALID_SEEDS', 'Protocol requires at least two seeds');
  if (new Set(seeds).size !== seeds.length) protocolError('INVALID_SEEDS', 'Protocol seeds must be distinct');
}

function validateProtocol(input) {
  validateIdentity(input);
  validateCriteria(input.criteria);
  const corpus = input.corpus;
  const counts = validateDisjointSplits(corpus || {});
  const seeds = input.seeds;
  validateSeeds(seeds);
  return { ...input, counts, manifestHash: hashManifest({ protocolId: input.protocolId, revision: input.revision, corpus, seeds, criteria: input.criteria }) };
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freezeDeep);
  return value;
}

function createValidationProtocol(input) {
  return freezeDeep(validateProtocol(input));
}

function verifyManifest(protocol, manifestHash) {
  if (!protocol || protocol.manifestHash !== manifestHash) protocolError('MANIFEST_MISMATCH', 'Protocol manifest hash does not match the frozen protocol');
  return { valid: true, protocolId: protocol.protocolId, revision: protocol.revision, manifestHash };
}

module.exports = { SPLITS, createValidationProtocol, validateProtocol, verifyManifest, hashManifest };
