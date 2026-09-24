'use strict';

const DATA_TYPES = new Set([
  'LEGACY_LWW', 'LWW_REGISTER', 'MV_REGISTER', 'G_COUNTER', 'PN_COUNTER',
  'ADD_WINS_SET', 'MAP', 'SEQUENCE', 'STATE_MACHINE', 'GRAPH', 'ESCROW_COUNTER'
]);
const CONSISTENCY_ZONES = new Set([
  'EVENTUAL', 'CAUSAL', 'INVARIANT_PRESERVING', 'SERIALIZABLE', 'APPEND_ONLY', 'IMMUTABLE'
]);
const OFFLINE_POLICIES = new Set(['ALLOW_LOCAL_MUTATION', 'ALLOW_READ_ONLY', 'QUEUE_UNTIL_CONNECTED', 'REJECT']);
const crdtTypes = require('./syncytiumCrdtTypeRegistry');
const invariantRegistry = require('./syncytium/invariants/invariantRegistry');
const invariantDependencyIndex = require('./syncytium/invariants/invariantDependencyIndex');

function compile(input) {
  if (input == null) return null;
  const source = normalizeSource(input);
  const fields = normalizeFields(source.fields);
  return schemaEnvelope(source, fields, invariantRegistry.compile(source.invariants));
}

function normalizeSource(input) {
  const source = Array.isArray(input) ? { fields: input } : input;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw schemaError('Schema must be an object or field list.');
  return source;
}

function schemaEnvelope(source, fields, invariants) {
  return {
    schemaId: String(source.schemaId || source.id || 'syncytium-schema-v1'),
    schemaVersion: Number.isInteger(source.schemaVersion || source.version) ? (source.schemaVersion || source.version) : 1,
    fields,
    invariants,
    invariantIndex: invariantDependencyIndex.compile(invariants)
  };
}

function normalizeFields(input) {
  if (input == null) return {};
  const entries = Array.isArray(input) ? input.map((field) => [field?.path, field]) : Object.entries(input);
  const result = {};
  for (const [rawPath, rawDefinition] of entries) {
    const path = String(rawDefinition?.path || rawPath || '').trim();
    if (!path || result[path]) throw schemaError(`Schema field path is empty or duplicated: '${path}'.`);
    result[path] = normalizeDefinition(path, rawDefinition);
  }
  return result;
}

function normalizeDefinition(path, definition = {}) {
  const dataType = String(definition.dataType || 'LEGACY_LWW').toUpperCase();
  const consistencyZone = String(definition.consistencyZone || 'EVENTUAL').toUpperCase();
  const authority = normalizeAuthority(definition);
  if (!DATA_TYPES.has(dataType)) throw schemaError(`Unsupported Syncytium field type '${dataType}'.`);
  if (!CONSISTENCY_ZONES.has(consistencyZone)) throw schemaError(`Unsupported consistency zone '${consistencyZone}'.`);
  return {
    path,
    dataType,
    mergeSemantics: String(definition.mergeSemantics || defaultMerge(dataType)).toUpperCase(),
    consistencyZone,
    ...authority,
    invariantRefs: Array.isArray(definition.invariantRefs) ? [...definition.invariantRefs] : [],
    allowedTransitions: normalizeTransitions(definition.allowedTransitions),
    escrowAllocations: normalizeEscrowAllocations(definition.escrowAllocations),
    maxStalenessMs: normalizeStaleness(definition.maxStalenessMs),
    offlinePolicy: normalizeOfflinePolicy(definition.offlinePolicy, consistencyZone),
    visibility: definition.visibility || 'DOMAIN',
    replicationPolicy: definition.replicationPolicy || 'ALL_SUBSCRIBED'
  };
}

function normalizeOfflinePolicy(value, zone) {
  const fallback = ['EVENTUAL', 'APPEND_ONLY'].includes(zone) ? 'ALLOW_LOCAL_MUTATION' : 'REJECT';
  const policy = String(value || fallback).toUpperCase();
  if (!OFFLINE_POLICIES.has(policy)) throw schemaError(`Unsupported offline policy '${policy}'.`);
  return policy;
}

function normalizeStaleness(value) {
  if (value === undefined || value === null) return null;
  const budget = Number(value);
  if (!Number.isSafeInteger(budget) || budget < 0) throw schemaError('maxStalenessMs must be a non-negative integer.');
  return budget;
}

function normalizeEscrowAllocations(allocations) {
  if (!allocations || typeof allocations !== 'object' || Array.isArray(allocations)) return {};
  const result = {};
  for (const [actor, value] of Object.entries(allocations)) {
    const amount = Number(value);
    if (!actor || !Number.isSafeInteger(amount) || amount < 0) throw schemaError('Escrow allocations must be non-negative integer values.');
    result[actor] = amount;
  }
  return result;
}

function normalizeAuthority(definition) {
  return {
    authorityPolicy: definition.authorityPolicy || 'MEMBERS',
    ownerDomain: definition.ownerDomain || definition.domainId || null
  };
}

function normalizeTransitions(transitions) {
  return Array.isArray(transitions) ? [...transitions] : [];
}

function defaultMerge(dataType) {
  return dataType === 'MV_REGISTER' ? 'MULTI_VALUE' : dataType === 'LEGACY_LWW' ? 'LWW' : dataType;
}

function admitOperation(schema, operation) {
  if (operation?.kind?.type === 'typed_field') return admitTypedOperation(schema, operation);
  return operation?.kind?.type === 'set_field' ? admitSetField(schema, operation) : { operation, warnings: [] };
}

function admitSetField(schema, operation) {
  if (!schema) return legacyOperation(operation);
  const key = String(operation.kind.key || '').trim();
  const field = schema.fields[key];
  if (!field) throw Object.assign(new Error(`Field '${key}' is not declared by the shared state schema.`), { code: 'SYNCYTIUM_FIELD_UNDECLARED' });
  if (!['LEGACY_LWW', 'LWW_REGISTER'].includes(field.dataType)) {
    throw Object.assign(new Error(`Field '${key}' requires a ${field.dataType} operation.`), { code: 'SYNCYTIUM_TYPED_OPERATION_REQUIRED' });
  }
  return { operation: { ...operation, schemaVersion: schema.schemaVersion, fieldType: field.dataType }, warnings: [] };
}

function admitTypedOperation(schema, operation) {
  if (!schema) throw Object.assign(new Error('Typed field operations require a shared state schema.'), { code: 'SYNCYTIUM_SCHEMA_REQUIRED' });
  if (!operation.opId || typeof operation.opId !== 'string') throw Object.assign(new Error('Typed field operations require opId.'), { code: 'SYNCYTIUM_OP_ID_REQUIRED' });
  const key = String(operation.kind.key || '').trim();
  const field = schema.fields[key];
  if (!field) throw Object.assign(new Error(`Field '${key}' is not declared by the shared state schema.`), { code: 'SYNCYTIUM_FIELD_UNDECLARED' });
  if (!crdtTypes.supports(field.dataType, operation.kind.action)) {
    throw Object.assign(new Error(`Action '${operation.kind.action}' is not supported for ${field.dataType}.`), { code: 'SYNCYTIUM_TYPED_OPERATION_INVALID' });
  }
  return {
    operation: {
      ...operation,
      schemaVersion: schema.schemaVersion,
      fieldType: field.dataType,
      fieldRules: { allowedTransitions: field.allowedTransitions, escrowAllocations: field.escrowAllocations }
    },
    warnings: []
  };
}

function legacyOperation(operation) {
  return { operation, warnings: [{ code: 'SYNCYTIUM_UNTYPED_FIELD', field: operation.kind.key || null }] };
}

function schemaError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_SCHEMA_INVALID' });
}

module.exports = { compile, admitOperation };
