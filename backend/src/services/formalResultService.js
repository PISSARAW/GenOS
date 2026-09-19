'use strict';

const { createHash } = require('node:crypto');
const { pack, unpack } = require('msgpackr');

const CONTRACT_VERSION = 'genos.formal-result/v1';
const MEDIA_TYPE = 'application/vnd.genos.formal-result+msgpack';
const MAGIC = Buffer.from('GFR1', 'ascii');
const STATUSES = Object.freeze(['conjecture', 'tested', 'refuted', 'formalized', 'verified']);
const EVIDENCE_KINDS = Object.freeze(['proof', 'counterexample', 'reproducible_artifact']);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function sha256Text(value, field) {
  const normalized = canonicalText(value, field);
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${field} must be a SHA-256 fingerprint.`);
  return normalized;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function normalizeAssumptions(value = []) {
  if (!Array.isArray(value)) throw new Error('assumptions must be an array.');
  return value.map((item, index) => ({
    id: canonicalText(item?.id, `assumptions[${index}].id`),
    statement: canonicalText(item?.statement, `assumptions[${index}].statement`),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeValidityDomain(value) {
  if (!value || typeof value !== 'object') throw new Error('validityDomain must be an object.');
  if (!Array.isArray(value.constraints)) throw new Error('validityDomain.constraints must be an array.');
  return {
    statement: canonicalText(value.statement, 'validityDomain.statement'),
    constraints: value.constraints.map((entry, index) => canonicalText(entry, `validityDomain.constraints[${index}]`)).sort(),
  };
}

function normalizeDependencies(value = []) {
  if (!Array.isArray(value)) throw new Error('dependencies must be an array.');
  return value.map((item, index) => ({
    resultId: sha256Text(item?.resultId, `dependencies[${index}].resultId`),
    semanticFingerprint: sha256Text(item?.semanticFingerprint, `dependencies[${index}].semanticFingerprint`),
    relation: canonicalText(item?.relation || 'uses', `dependencies[${index}].relation`),
  })).sort((left, right) => left.resultId.localeCompare(right.resultId));
}

function normalizeEvidence(value) {
  if (!value || typeof value !== 'object') throw new Error('evidence must be an object.');
  if (!EVIDENCE_KINDS.includes(value.kind)) throw new Error(`evidence.kind must be one of: ${EVIDENCE_KINDS.join(', ')}.`);
  if (value.content === undefined || value.content === null) throw new Error('evidence.content is required.');
  const content = canonicalValue(value.content);
  const reproduction = canonicalValue(value.reproduction || null);
  if (value.kind === 'reproducible_artifact' && !reproduction) {
    throw new Error('evidence.reproduction is required for a reproducible artifact.');
  }
  if (value.kind === 'reproducible_artifact') {
    canonicalText(reproduction.command, 'evidence.reproduction.command');
    canonicalText(reproduction.environment, 'evidence.reproduction.environment');
  }
  return { kind: value.kind, content, reproduction, digest: digest(pack(content)) };
}

function normalizeProvenance(value) {
  if (!value || typeof value !== 'object') throw new Error('provenance must be an object.');
  if (!Array.isArray(value.inputs) || !Array.isArray(value.transformations)) {
    throw new Error('provenance.inputs and provenance.transformations must be arrays.');
  }
  const source = value.source || {};
  const provenance = {
    createdAt: canonicalText(value.createdAt, 'provenance.createdAt'),
    actor: canonicalText(value.actor, 'provenance.actor'),
    source: {
      type: canonicalText(source.type, 'provenance.source.type'),
      uri: canonicalText(source.uri, 'provenance.source.uri'),
      digest: sha256Text(source.digest, 'provenance.source.digest'),
    },
    inputs: value.inputs.map((item, index) => ({
      id: canonicalText(item?.id, `provenance.inputs[${index}].id`),
      digest: sha256Text(item?.digest, `provenance.inputs[${index}].digest`),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    transformations: value.transformations.map((entry, index) => canonicalText(entry, `provenance.transformations[${index}]`)),
  };
  if (Number.isNaN(Date.parse(provenance.createdAt))) throw new Error('provenance.createdAt must be an ISO-8601 timestamp.');
  return provenance;
}

function normalizeProducer(value) {
  if (!value || typeof value !== 'object') throw new Error('producer must be an object.');
  return {
    model: canonicalText(value.model, 'producer.model'),
    version: canonicalText(value.version, 'producer.version'),
  };
}

function validateStatusEvidence(status, evidence) {
  if (status === 'verified' && evidence.kind !== 'proof') {
    throw new Error('verified status requires proof evidence.');
  }
  if (status === 'refuted' && evidence.kind !== 'counterexample') {
    throw new Error('refuted status requires counterexample evidence.');
  }
}

function semanticTuple(result) {
  return [
    result.canonicalStatement,
    result.assumptions.map((item) => [item.id, item.statement]),
    [result.validityDomain.statement, result.validityDomain.constraints],
  ];
}

function wireTuple(result) {
  return [
    1,
    result.canonicalStatement,
    result.semanticFingerprint,
    result.assumptions.map((item) => [item.id, item.statement]),
    [result.validityDomain.statement, result.validityDomain.constraints],
    result.dependencies.map((item) => [item.resultId, item.semanticFingerprint, item.relation]),
    STATUSES.indexOf(result.status),
    [result.evidence.kind, result.evidence.content, result.evidence.reproduction, result.evidence.digest],
    [result.provenance.createdAt, result.provenance.actor, result.provenance.source,
      result.provenance.inputs, result.provenance.transformations],
    [result.producer.model, result.producer.version],
  ];
}

function createFormalResult(input = {}) {
  if (!STATUSES.includes(input.status)) throw new Error(`status must be one of: ${STATUSES.join(', ')}.`);
  const evidence = normalizeEvidence(input.evidence);
  validateStatusEvidence(input.status, evidence);
  const result = {
    contractVersion: CONTRACT_VERSION,
    canonicalStatement: canonicalText(input.canonicalStatement, 'canonicalStatement'),
    assumptions: normalizeAssumptions(input.assumptions),
    validityDomain: normalizeValidityDomain(input.validityDomain),
    dependencies: normalizeDependencies(input.dependencies),
    status: input.status,
    evidence,
    provenance: normalizeProvenance(input.provenance),
    producer: normalizeProducer(input.producer),
  };
  result.semanticFingerprint = digest(pack(semanticTuple(result)));
  result.resultId = digest(pack(wireTuple(result)));
  return result;
}

function encodeFormalResult(input) {
  const result = createFormalResult(input);
  return Buffer.concat([MAGIC, pack([...wireTuple(result), result.resultId])]);
}

function resultFromTuple(tuple) {
  if (!Array.isArray(tuple) || tuple.length !== 11 || tuple[0] !== 1) throw new Error('Unsupported formal result frame.');
  return {
    canonicalStatement: tuple[1],
    semanticFingerprint: tuple[2],
    assumptions: tuple[3].map(([id, statement]) => ({ id, statement })),
    validityDomain: { statement: tuple[4][0], constraints: tuple[4][1] },
    dependencies: tuple[5].map(([resultId, semanticFingerprint, relation]) => ({ resultId, semanticFingerprint, relation })),
    status: STATUSES[tuple[6]],
    evidence: { kind: tuple[7][0], content: tuple[7][1], reproduction: tuple[7][2], digest: tuple[7][3] },
    provenance: { createdAt: tuple[8][0], actor: tuple[8][1], source: tuple[8][2], inputs: tuple[8][3], transformations: tuple[8][4] },
    producer: { model: tuple[9][0], version: tuple[9][1] },
    resultId: tuple[10],
  };
}

function decodeFormalResult(frame) {
  if (!Buffer.isBuffer(frame) && !(frame instanceof Uint8Array)) throw new Error('Formal result frame must be binary.');
  const bytes = Buffer.from(frame);
  if (bytes.length <= MAGIC.length || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid formal result magic.');
  const decoded = resultFromTuple(unpack(bytes.subarray(MAGIC.length)));
  const verified = createFormalResult(decoded);
  if (decoded.semanticFingerprint !== verified.semanticFingerprint) throw new Error('Semantic fingerprint mismatch.');
  if (decoded.evidence.digest !== verified.evidence.digest) throw new Error('Evidence digest mismatch.');
  if (decoded.resultId !== verified.resultId) throw new Error('Result integrity mismatch.');
  return verified;
}

module.exports = {
  CONTRACT_VERSION,
  MEDIA_TYPE,
  STATUSES,
  EVIDENCE_KINDS,
  createFormalResult,
  encodeFormalResult,
  decodeFormalResult,
};
