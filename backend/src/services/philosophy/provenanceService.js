'use strict';

const crypto = require('crypto');
const { validateSpec } = require('../specValidator');

const SOURCE_TYPES = new Set(['primary', 'secondary', 'genos', 'observation', 'inference', 'interpretation', 'runtime']);
const EVIDENCE_STATUSES = new Set(['documented', 'observed', 'inferred', 'interpretive', 'verified', 'unverified']);
const INTERPRETATION_STATUSES = new Set(['none', 'conceptual', 'provisional', 'contested', 'final']);

function createRecord(input = {}) {
  const subject = requireSubject(input.subject);
  const context = normalizeContext(input, subject);
  assertContextEnums(context);
  const record = buildRecord(context);
  const validation = validateSpec('provenance-record.schema.json', record);
  if (!validation.valid) throw new Error(`Invalid provenance record: ${validation.errors.join('; ')}`);
  return record;
}

function requireSubject(subject) {
  if (!subject || typeof subject !== 'object' || !subject.kind || !subject.id) throw new Error('subject.kind and subject.id are required.');
  return { kind: String(subject.kind), id: String(subject.id) };
}

function normalizeContext(input, subject) {
  return {
    input,
    subject,
    sourceType: input.sourceType || 'genos',
    evidenceStatus: input.evidenceStatus || 'documented',
    interpretationStatus: input.interpretationStatus || 'none',
  };
}

function assertContextEnums(context) {
  assertEnum(context.sourceType, SOURCE_TYPES, 'sourceType');
  assertEnum(context.evidenceStatus, EVIDENCE_STATUSES, 'evidenceStatus');
  assertEnum(context.interpretationStatus, INTERPRETATION_STATUSES, 'interpretationStatus');
}

function buildRecord(context) {
  const { input, subject, sourceType, evidenceStatus, interpretationStatus } = context;
  return {
    apiVersion: 'genos.provenance/v1',
    kind: 'ProvenanceRecord',
    recordId: input.recordId || createId(subject),
    subject,
    version: input.version || '1.0.0',
    sourceType,
    sourceDocument: input.sourceDocument || null,
    sourceLocator: input.sourceLocator || null,
    evidenceStatus,
    interpretationStatus,
    derivedFrom: Array.isArray(input.derivedFrom) ? input.derivedFrom : [],
    recordedAt: input.recordedAt || new Date().toISOString()
  };
}

function nextVersion(version = '1.0.0') {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error('version must use MAJOR.MINOR.PATCH format.');
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function validateChain(records = []) {
  const ids = new Set(records.map((record) => record.recordId));
  const errors = [];
  records.forEach((record) => (record.derivedFrom || []).forEach((parent) => {
    if (!ids.has(parent)) errors.push(`${record.recordId} references unknown provenance record '${parent}'`);
  }));
  return { valid: errors.length === 0, errors };
}

function createId(subject) {
  return `prov_${crypto.createHash('sha256').update(`${subject.kind}:${subject.id}:${Date.now()}`).digest('hex').slice(0, 24)}`;
}

function assertEnum(value, values, field) {
  if (!values.has(value)) throw new Error(`Unknown ${field} '${value}'.`);
}

module.exports = { SOURCE_TYPES, EVIDENCE_STATUSES, INTERPRETATION_STATUSES, createRecord, nextVersion, validateChain };
