'use strict';

function invalid(message) {
  return Object.assign(new Error(message), { code: 'HOLOBIONT_TOOL_MANIFEST_INVALID' });
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object.`);
  return value;
}

function permissionGaps(permissions, leased) {
  return permissions.filter((permission) => !leased.has(permission));
}

const SCHEMA_KEYS = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength',
  'pattern', 'minItems', 'maxItems', 'uniqueItems', 'allOf', 'anyOf', 'oneOf', 'not']);
const JSON_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function schemaChildrenValid(schema, seen) {
  const nested = [...Object.values(schema.properties || {}), schema.items, typeof schema.additionalProperties === 'object' && schema.additionalProperties,
    ...(schema.allOf || []), ...(schema.anyOf || []), ...(schema.oneOf || []), schema.not].filter((item) => item !== undefined && item !== false && item !== true);
  const additionalValid = schema.additionalProperties === undefined || typeof schema.additionalProperties === 'boolean'
    || (schema.additionalProperties && typeof schema.additionalProperties === 'object' && !Array.isArray(schema.additionalProperties));
  const itemsValid = schema.items === undefined || typeof schema.items === 'boolean'
    || (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items));
  return additionalValid && itemsValid && nested.every((item) => schemaShape(item, seen));
}

function schemaValuesValid(schema) {
  const numbers = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'];
  const counts = ['minLength', 'maxLength', 'minItems', 'maxItems'];
  const finite = numbers.every((key) => schema[key] === undefined || Number.isFinite(schema[key]));
  const positiveMultiple = schema.multipleOf === undefined || schema.multipleOf > 0;
  const nonnegativeCounts = counts.every((key) => schema[key] === undefined || (Number.isInteger(schema[key]) && schema[key] >= 0));
  const orderedCounts = !((schema.minLength > schema.maxLength) || (schema.minItems > schema.maxItems));
  const enumValid = schema.enum === undefined || (Array.isArray(schema.enum) && schema.enum.length > 0);
  return finite && positiveMultiple && nonnegativeCounts && orderedCounts && enumValid;
}

function schemaShape(schema, seen = new Set()) {
  if (schema === true || schema === false) return true;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || seen.has(schema)) return false;
  if (Object.keys(schema).some((key) => !SCHEMA_KEYS.has(key))) return false;
  seen.add(schema);
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const typeValid = types.every((type) => JSON_TYPES.has(type)) && new Set(types).size === types.length;
  const requiredValid = schema.required === undefined || (Array.isArray(schema.required)
    && schema.required.every((key) => typeof key === 'string') && new Set(schema.required).size === schema.required.length);
  const patternValid = schema.pattern === undefined || safePattern(schema.pattern) !== null;
  const propertiesValid = schema.properties === undefined || (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties));
  const combinatorsValid = ['allOf', 'anyOf', 'oneOf'].every((key) => schema[key] === undefined || (Array.isArray(schema[key]) && schema[key].length > 0));
  const valid = typeValid && (!schema.type || types.length > 0) && requiredValid && patternValid && propertiesValid
    && combinatorsValid && schemaValuesValid(schema) && schemaChildrenValid(schema, seen);
  seen.delete(schema);
  return valid;
}

function safePattern(value) {
  if (typeof value !== 'string') return null;
  try { return new RegExp(value, 'u'); } catch { return null; }
}

function manifestShape(manifest) {
  return Boolean(typeof manifest.name === 'string' && manifest.name.trim() && typeof manifest.version === 'string'
    && manifest.version.trim() && schemaShape(manifest.inputSchema) && schemaShape(manifest.outputSchema));
}

function validLease(input, manifest) {
  const lease = input.toolLease;
  return Boolean(lease && lease.toolName === manifest.name && Date.parse(lease.expiresAt) > Date.now()
    && typeof input.verifyLease === 'function' && input.verifyLease(lease) === true);
}

function toolChecks(input, manifest, unknownPermissions) {
  const healthy = typeof input.verifyHealth === 'function' && input.verifyHealth(manifest) === true;
  const revoked = typeof input.isRevoked === 'function' && input.isRevoked(manifest) === true;
  const leaseValid = validLease(input, manifest);
  const valid = manifestShape(manifest) && unknownPermissions.length === 0 && healthy && !revoked && leaseValid;
  return { healthy, revoked, leaseValid, valid };
}

function validateToolManifest(input = {}) {
  const manifest = object(input.manifest, 'manifest');
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const leased = new Set(Array.isArray(input.leasedPermissions) ? input.leasedPermissions : []);
  const unknownPermissions = permissionGaps(permissions, leased);
  const checks = toolChecks(input, manifest, unknownPermissions);
  return { valid: checks.valid, unknownPermissions, fallback: checks.valid ? null : input.fallback || null,
    reason: toolFailureReason({ ...checks, unknownPermissions }) };
}

function toolFailureReason(state) {
  if (state.valid) return null;
  if (state.revoked) return 'REVOKED';
  if (!state.leaseValid) return 'LEASE_INVALID';
  if (!state.healthy) return 'UNHEALTHY';
  return state.unknownPermissions.length ? 'UNLEASED_PERMISSION' : 'INVALID_MANIFEST';
}

function typeMatches(type, value) {
  return type === 'null' ? value === null : type === 'array' ? Array.isArray(value)
    : type === 'object' ? Boolean(value && typeof value === 'object' && !Array.isArray(value))
      : type === 'integer' ? Number.isInteger(value) : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === type;
}

function fail(errors, path, keyword, message) {
  errors.push({ path, keyword, message });
}

function validateObject(schema, value, path, errors) {
  for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(errors, `${path}.${key}`, 'required', 'Property is required.');
  const properties = schema.properties || {};
  for (const [key, descriptor] of Object.entries(properties)) {
    if (Object.hasOwn(value, key)) validateNode(descriptor, value[key], `${path}.${key}`, errors);
  }
  for (const [key, item] of Object.entries(value)) {
    if (Object.hasOwn(properties, key)) continue;
    if (schema.additionalProperties === false) fail(errors, `${path}.${key}`, 'additionalProperties', 'Property is not allowed.');
    else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      validateNode(schema.additionalProperties, item, `${path}.${key}`, errors);
    }
  }
}

function validateArray(schema, value, path, errors) {
  if (schema.minItems !== undefined && value.length < schema.minItems) fail(errors, path, 'minItems', 'Array is too short.');
  if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(errors, path, 'maxItems', 'Array is too long.');
  if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
    fail(errors, path, 'uniqueItems', 'Array items must be unique.');
  }
  if (schema.items !== undefined) value.forEach((item, index) => validateNode(schema.items, item, `${path}[${index}]`, errors));
}

function validateScalar(schema, value, path, errors) {
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) fail(errors, path, 'minLength', 'String is too short.');
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) fail(errors, path, 'maxLength', 'String is too long.');
    const pattern = schema.pattern === undefined ? null : safePattern(schema.pattern);
    if (pattern && !pattern.test(value)) fail(errors, path, 'pattern', 'String does not match the required pattern.');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(errors, path, 'minimum', 'Number is below minimum.');
    if (schema.maximum !== undefined && value > schema.maximum) fail(errors, path, 'maximum', 'Number is above maximum.');
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail(errors, path, 'exclusiveMinimum', 'Number is not above exclusive minimum.');
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail(errors, path, 'exclusiveMaximum', 'Number is not below exclusive maximum.');
    if (schema.multipleOf !== undefined && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-10) {
      fail(errors, path, 'multipleOf', 'Number is not a multiple of the required value.');
    }
  }
}

function validateAlternatives(schema, value, path, errors) {
  for (const [keyword, schemas] of [['allOf', schema.allOf], ['anyOf', schema.anyOf], ['oneOf', schema.oneOf]]) {
    if (!schemas) continue;
    const counts = schemas.map((item) => { const branchErrors = []; validateNode(item, value, path, branchErrors); return branchErrors.length === 0; });
    const valid = keyword === 'allOf' ? counts.every(Boolean) : keyword === 'anyOf' ? counts.some(Boolean) : counts.filter(Boolean).length === 1;
    if (!valid) fail(errors, path, keyword, `Value does not satisfy ${keyword}.`);
  }
  if (schema.not) { const branchErrors = []; validateNode(schema.not, value, path, branchErrors); if (!branchErrors.length) fail(errors, path, 'not', 'Value matches a forbidden schema.'); }
}

function validateNode(schema, value, path, errors) {
  if (schema === false) { fail(errors, path, 'falseSchema', 'Value is forbidden.'); return; }
  if (schema === true) return;
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(type, value))) { fail(errors, path, 'type', 'Value has the wrong type.'); return; }
  }
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) fail(errors, path, 'enum', 'Value is not an allowed enum member.');
  if (Object.hasOwn(schema, 'const') && JSON.stringify(schema.const) !== JSON.stringify(value)) fail(errors, path, 'const', 'Value differs from the required constant.');
  if (value && typeof value === 'object' && !Array.isArray(value)) validateObject(schema, value, path, errors);
  if (Array.isArray(value)) validateArray(schema, value, path, errors);
  validateScalar(schema, value, path, errors);
  validateAlternatives(schema, value, path, errors);
}

function schemaErrors(context) {
  const errors = [];
  validateNode(context.schema, context.value, '$', errors);
  return { errors, missing: errors.filter((item) => item.keyword === 'required').map((item) => item.path.slice(2)),
    invalidTypes: errors.filter((item) => item.keyword === 'type').map((item) => item.path.slice(2)),
    extras: errors.filter((item) => item.keyword === 'additionalProperties').map((item) => item.path.slice(2)) };
}

function validateToolInvocation(input = {}) {
  const schema = input.schema;
  if (!schemaShape(schema)) throw invalid('Tool invocation schema is invalid or uses unsupported JSON Schema keywords.');
  const errors = schemaErrors({ schema, value: input.value });
  return { valid: errors.errors.length === 0, ...errors };
}

function authorizeToolInvocation(input = {}) {
  const manifest = validateToolManifest(input);
  if (!manifest.valid) return { allowed: false, reason: manifest.reason, manifest, invocation: null };
  const invocation = validateToolInvocation({ schema: input.manifest.inputSchema, value: input.value });
  return { allowed: invocation.valid, reason: invocation.valid ? null : 'INPUT_SCHEMA_INVALID', manifest, invocation };
}

async function executeToolInvocation(input = {}) {
  const authorization = authorizeToolInvocation(input);
  if (!authorization.allowed) return { executed: false, reason: authorization.reason, authorization, output: null };
  if (typeof input.execute !== 'function') return { executed: false, reason: 'EXECUTOR_REQUIRED', authorization, output: null };
  const output = await input.execute(input.value, input.manifest, input.signal);
  const outputValidation = validateToolInvocation({ schema: input.manifest.outputSchema, value: output });
  return { executed: true, accepted: outputValidation.valid, reason: outputValidation.valid ? null : 'OUTPUT_SCHEMA_INVALID',
    authorization, output, outputValidation };
}

module.exports = { validateToolManifest, validateToolInvocation, authorizeToolInvocation, executeToolInvocation };
