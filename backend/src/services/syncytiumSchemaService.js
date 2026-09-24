'use strict';

const DATA_TYPES = new Set([
  'LEGACY_LWW', 'LWW_REGISTER', 'MV_REGISTER', 'G_COUNTER', 'PN_COUNTER',
  'ADD_WINS_SET', 'MAP', 'SEQUENCE', 'STATE_MACHINE', 'GRAPH', 'ESCROW_COUNTER'
]);
const CONSISTENCY_ZONES = new Set([
  'EVENTUAL', 'CAUSAL', 'INVARIANT_PRESERVING', 'SERIALIZABLE', 'APPEND_ONLY', 'IMMUTABLE'
]);

function compile(input) {
  if (input == null) return null;
  const source = normalizeSource(input);
  const fields = normalizeFields(source.fields);
  return schemaEnvelope(source, fields);
}

function normalizeSource(input) {
  const source = Array.isArray(input) ? { fields: input } : input;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw schemaError('Schema must be an object or field list.');
  return source;
}

function schemaEnvelope(source, fields) {
  return {
    schemaId: String(source.schemaId || source.id || 'syncytium-schema-v1'),
    schemaVersion: Number.isInteger(source.schemaVersion || source.version) ? (source.schemaVersion || source.version) : 1,
    fields
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
  if (!DATA_TYPES.has(dataType)) throw schemaError(`Unsupported Syncytium field type '${dataType}'.`);
  if (!CONSISTENCY_ZONES.has(consistencyZone)) throw schemaError(`Unsupported consistency zone '${consistencyZone}'.`);
  return {
    path,
    dataType,
    mergeSemantics: String(definition.mergeSemantics || defaultMerge(dataType)).toUpperCase(),
    consistencyZone,
    authorityPolicy: definition.authorityPolicy || 'MEMBERS',
    invariantRefs: Array.isArray(definition.invariantRefs) ? [...definition.invariantRefs] : [],
    visibility: definition.visibility || 'DOMAIN',
    replicationPolicy: definition.replicationPolicy || 'ALL_SUBSCRIBED'
  };
}

function defaultMerge(dataType) {
  return dataType === 'MV_REGISTER' ? 'MULTI_VALUE' : dataType === 'LEGACY_LWW' ? 'LWW' : dataType;
}

function admitOperation(schema, operation) {
  if (operation?.kind?.type !== 'set_field') return { operation, warnings: [] };
  if (!schema) return legacyOperation(operation);
  const key = String(operation.kind.key || '').trim();
  const field = schema.fields[key];
  if (!field) throw Object.assign(new Error(`Field '${key}' is not declared by the shared state schema.`), { code: 'SYNCYTIUM_FIELD_UNDECLARED' });
  if (!['LEGACY_LWW', 'LWW_REGISTER'].includes(field.dataType)) {
    throw Object.assign(new Error(`Field '${key}' requires a ${field.dataType} operation.`), { code: 'SYNCYTIUM_TYPED_OPERATION_REQUIRED' });
  }
  return { operation: { ...operation, schemaVersion: schema.schemaVersion, fieldType: field.dataType }, warnings: [] };
}

function legacyOperation(operation) {
  return { operation, warnings: [{ code: 'SYNCYTIUM_UNTYPED_FIELD', field: operation.kind.key || null }] };
}

function schemaError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_SCHEMA_INVALID' });
}

module.exports = { compile, admitOperation };
