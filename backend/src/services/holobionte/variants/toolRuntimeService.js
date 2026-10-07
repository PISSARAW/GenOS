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
  const nested = schemaChildrenValidCondition(schema).filter((item) => item !== undefined && item !== false && item !== true);
  const additionalValid = schemaChildrenValidAdditionalValid(schema);
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
  return schemaValuesValidCondition({ finite, positiveMultiple, nonnegativeCounts, orderedCounts, enumValid });
}

function schemaShape(schema, seen = new Set()) {
  if (schema === true || schema === false) return true;
  if (schemaShapeCondition(schema, seen)) return false;
  if (Object.keys(schema).some((key) => !SCHEMA_KEYS.has(key))) return false;
  seen.add(schema);
  const types = schemaShapeTypes(schema);
  const typeValid = types.every((type) => JSON_TYPES.has(type)) && new Set(types).size === types.length;
  const requiredValid = schemaRequiredValid(schema);
  const patternValid = schema.pattern === undefined || safePattern(schema.pattern) !== null;
  const propertiesValid = schemaShapePropertiesValid(schema);
  const combinatorsValid = ['allOf', 'anyOf', 'oneOf'].every((key) => schemaShapeCondition3(schema, key));
  const valid = schemaShapeCondition2({ typeValid, schema, types, requiredValid, patternValid, propertiesValid })
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

function fail(errors, path, { keyword, message } = {}) {
  errors.push({ path, keyword, message });
}

function validateObject(schema, value, { path, errors } = {}) {
  for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(errors, `${path}.${key}`, { keyword: 'required', message: 'Property is required.' });
  const properties = schema.properties || {};
  for (const [key, descriptor] of Object.entries(properties)) {
    if (Object.hasOwn(value, key)) validateNode(descriptor, value[key], { path: `${path}.${key}`, errors: errors });
  }
  validateAdditionalProperties(schema, value, { path, errors, properties });
}

function validateArray(schema, value, { path, errors } = {}) {
  if (schema.minItems !== undefined && value.length < schema.minItems) fail(errors, path, { keyword: 'minItems', message: 'Array is too short.' });
  if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(errors, path, { keyword: 'maxItems', message: 'Array is too long.' });
  if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
    fail(errors, path, { keyword: 'uniqueItems', message: 'Array items must be unique.' });
  }
  if (schema.items !== undefined) value.forEach((item, index) => validateNode(schema.items, item, { path: `${path}[${index}]`, errors: errors }));
}

function checkNumberBounds(schema, value, ctx) {
  if (schema.minimum !== undefined && value < schema.minimum) fail(ctx.errors, ctx.path, { keyword: 'minimum', message: 'Number is below minimum.' });
  if (schema.maximum !== undefined && value > schema.maximum) fail(ctx.errors, ctx.path, { keyword: 'maximum', message: 'Number is above maximum.' });
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail(ctx.errors, ctx.path, { keyword: 'exclusiveMinimum', message: 'Number is not above exclusive minimum.' });
  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail(ctx.errors, ctx.path, { keyword: 'exclusiveMaximum', message: 'Number is not below exclusive maximum.' });
}

function checkMultipleOf(schema, value, ctx) {
  if (schema.multipleOf !== undefined && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-10) {
    fail(ctx.errors, ctx.path, { keyword: 'multipleOf', message: 'Number is not a multiple of the required value.' });
  }
}

function validateScalar(schema, value, { path, errors } = {}) {
  validateStringScalar(schema, value, { path, errors });
  if (typeof value !== 'number') return;
  const ctx = { path, errors };
  checkNumberBounds(schema, value, ctx);
  checkMultipleOf(schema, value, ctx);
}

function validateAlternatives(schema, value, { path, errors } = {}) {
  for (const [keyword, schemas] of [['allOf', schema.allOf], ['anyOf', schema.anyOf], ['oneOf', schema.oneOf]]) {
    if (!schemas) continue;
    const counts = schemas.map((item) => { const branchErrors = []; validateNode(item, value, { path: path, errors: branchErrors }); return branchErrors.length === 0; });
    const valid = keyword === 'allOf' ? counts.every(Boolean) : keyword === 'anyOf' ? counts.some(Boolean) : counts.filter(Boolean).length === 1;
    if (!valid) fail(errors, path, { keyword: keyword, message: `Value does not satisfy ${keyword}.` });
  }
  if (schema.not) { const branchErrors = []; validateNode(schema.not, value, { path: path, errors: branchErrors }); if (!branchErrors.length) fail(errors, path, { keyword: 'not', message: 'Value matches a forbidden schema.' }); }
}

function validateNode(schema, value, { path, errors } = {}) {
  if (schema === false) { fail(errors, path, { keyword: 'falseSchema', message: 'Value is forbidden.' }); return; }
  if (schema === true) return;
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(type, value))) { fail(errors, path, { keyword: 'type', message: 'Value has the wrong type.' }); return; }
  }
  validateConstantValues(schema, value, { path, errors });
  if (validateNodeCondition(value)) validateObject(schema, value, { path: path, errors: errors });
  if (Array.isArray(value)) validateArray(schema, value, { path: path, errors: errors });
  validateScalar(schema, value, { path: path, errors: errors });
  validateAlternatives(schema, value, { path: path, errors: errors });
}

function schemaErrors(context) {
  const errors = [];
  validateNode(context.schema, context.value, { path: '$', errors: errors });
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

function schemaChildrenValidCondition(schema) {
  return [...Object.values(schema.properties || {}), schema.items, typeof schema.additionalProperties === 'object' && schema.additionalProperties,
    ...(schema.allOf || []), ...(schema.anyOf || []), ...(schema.oneOf || []), schema.not];
}

function schemaChildrenValidAdditionalValid(schema) {
  return schema.additionalProperties === undefined || typeof schema.additionalProperties === 'boolean'
    || (schema.additionalProperties && typeof schema.additionalProperties === 'object' && !Array.isArray(schema.additionalProperties));
}

function schemaShapePropertiesValid(schema) {
  return schema.properties === undefined || (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties));
}

function schemaShapeCondition(schema, seen) {
  return !schema || typeof schema !== 'object' || Array.isArray(schema) || seen.has(schema);
}

function schemaValuesValidCondition({ finite, positiveMultiple, nonnegativeCounts, orderedCounts, enumValid }) {
  return finite && positiveMultiple && nonnegativeCounts && orderedCounts && enumValid;
}

function validateNodeCondition(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function schemaShapeCondition2({ typeValid, schema, types, requiredValid, patternValid, propertiesValid }) {
  return typeValid && (!schema.type || types.length > 0) && requiredValid && patternValid && propertiesValid;
}

function schemaShapeTypes(schema) {
  return schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
}

function schemaShapeCondition3(schema, key) {
  return schema[key] === undefined || (Array.isArray(schema[key]) && schema[key].length > 0);
}

function schemaRequiredValid(schema) {
  return schema.required === undefined || (Array.isArray(schema.required)
    && schema.required.every((key) => typeof key === 'string') && new Set(schema.required).size === schema.required.length);
}

function validateAdditionalProperties(schema, value, { path, errors, properties }) {
for (const [key, item] of Object.entries(value)) {
    if (Object.hasOwn(properties, key)) continue;
    if (schema.additionalProperties === false) fail(errors, `${path}.${key}`, { keyword: 'additionalProperties', message: 'Property is not allowed.' });
    else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      validateNode(schema.additionalProperties, item, { path: `${path}.${key}`, errors: errors });
    }
  }
}

function validateStringScalar(schema, value, { path, errors }) {
if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) fail(errors, path, { keyword: 'minLength', message: 'String is too short.' });
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) fail(errors, path, { keyword: 'maxLength', message: 'String is too long.' });
    const pattern = schema.pattern === undefined ? null : safePattern(schema.pattern);
    if (pattern && !pattern.test(value)) fail(errors, path, { keyword: 'pattern', message: 'String does not match the required pattern.' });
  }
}

function validateConstantValues(schema, value, { path, errors }) {
if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) fail(errors, path, { keyword: 'enum', message: 'Value is not an allowed enum member.' });
  if (Object.hasOwn(schema, 'const') && JSON.stringify(schema.const) !== JSON.stringify(value)) fail(errors, path, { keyword: 'const', message: 'Value differs from the required constant.' });
}
