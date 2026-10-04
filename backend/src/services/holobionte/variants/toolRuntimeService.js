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

function manifestShape(manifest) {
  return Boolean(manifest.name && manifest.version && schemaShape(manifest.inputSchema) && schemaShape(manifest.outputSchema));
}

function schemaShape(schema) {
  return Boolean(schema && typeof schema === 'object' && !Array.isArray(schema)
    && (!schema.type || ['object', 'array', 'string', 'number', 'integer', 'boolean'].includes(schema.type))
    && (!schema.properties || (typeof schema.properties === 'object' && !Array.isArray(schema.properties))));
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

function schemaErrors(context) {
  const { schema, value } = context;
  const properties = object(schema.properties || {}, 'schema.properties');
  const required = Array.isArray(schema.required) ? schema.required : [];
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const invalidTypes = Object.entries(properties).filter(([key, descriptor]) => Object.hasOwn(value, key)
    && descriptor.type && typeof value[key] !== descriptor.type
    && !(descriptor.type === 'integer' && Number.isInteger(value[key]))).map(([key]) => key);
  const extras = schema.additionalProperties === false ? Object.keys(value).filter((key) => !Object.hasOwn(properties, key)) : [];
  return { missing, invalidTypes, extras };
}

function validateToolInvocation(input = {}) {
  const errors = schemaErrors({ schema: object(input.schema, 'schema'), value: object(input.value, 'tool input') });
  return { valid: !errors.missing.length && !errors.invalidTypes.length && !errors.extras.length, ...errors };
}

function authorizeToolInvocation(input = {}) {
  const manifest = validateToolManifest(input);
  if (!manifest.valid) return { allowed: false, reason: manifest.reason, manifest, invocation: null };
  const invocation = validateToolInvocation({ schema: input.manifest.inputSchema, value: input.value });
  return { allowed: invocation.valid, reason: invocation.valid ? null : 'INPUT_SCHEMA_INVALID', manifest, invocation };
}

module.exports = { validateToolManifest, validateToolInvocation, authorizeToolInvocation };
