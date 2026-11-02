'use strict';

const { canonicalize } = require('./canonical');

const HASH = /^sha256:[a-f0-9]{64}$/;

function identifier(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw new Error('Jury identifiers must be nonempty strings of at most 256 characters.');
  }
  if (['__proto__', 'constructor', 'prototype'].includes(value)) {
    throw new Error('Reserved jury identifier.');
  }
  return value;
}

function identifiers(values) {
  if (!Array.isArray(values)) throw new Error('Jury identifier array required.');
  const result = values.map(identifier).sort();
  if (new Set(result).size !== result.length) throw new Error('Duplicate jury identifier.');
  return result;
}

function normalizeParticipant(value) {
  const result = {
    agentId: identifier(value.agentId), incarnationId: identifier(value.incarnationId),
    executionId: identifier(value.executionId), methodId: identifier(value.methodId),
    provenanceRoots: identifiers(value.provenanceRoots), dependsOn: identifiers(value.dependsOn),
  };
  if (!result.provenanceRoots.length) throw new Error('Observable provenance roots required.');
  return result;
}

function normalizeParticipants(values) {
  if (!Array.isArray(values) || !values.length || values.length > 128) {
    throw new Error('A jury requires between 1 and 128 declared participants.');
  }
  const participants = values.map(normalizeParticipant).sort((a, b) => a.agentId < b.agentId ? -1 : 1);
  const ids = identifiers(participants.map((item) => item.agentId));
  for (const participant of participants) {
    if (participant.dependsOn.some((id) => !ids.includes(id))) {
      throw new Error('Declared jury dependency must identify a participant.');
    }
  }
  return participants;
}

function boundedContext(context, limit = 65536) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 65536) {
    throw new Error('Jury context bound must be between 1 and 65536 bytes.');
  }
  const encoded = canonicalize(context);
  if (Buffer.byteLength(encoded, 'utf8') > limit) throw new Error('Jury context exceeds byte bound.');
  return JSON.parse(encoded);
}

function validReveal(value) {
  identifier(value.verifierId);
  if (!['accept', 'reject', 'unknown'].includes(value.verdict)) throw new Error('Unknown jury verdict.');
  if (typeof value.nonce !== 'string' || value.nonce.length < 32 || value.nonce.length > 256) {
    throw new Error('Jury nonce must contain between 32 and 256 characters.');
  }
  return { verifierId: value.verifierId, verdict: value.verdict, nonce: value.nonce };
}

function normalizePolicy(policy) {
  const copy = JSON.parse(canonicalize(policy));
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) throw new Error('Jury policy object required.');
  if (Object.keys(copy).length !== 1 || !Number.isInteger(copy.minSupportGroups) || copy.minSupportGroups < 1) {
    throw new Error('Only a positive minSupportGroups policy is supported.');
  }
  return copy;
}

module.exports = { HASH, identifier, normalizeParticipants, boundedContext, validReveal, normalizePolicy };
