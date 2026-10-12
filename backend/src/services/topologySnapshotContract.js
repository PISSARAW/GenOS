'use strict';

const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const STATUSES = new Set(['captured', 'reference-only', 'unsupported', 'conflict']);
const BINDING_FIELDS = ['topologyId', 'variantId', 'sessionId', 'agentId', 'workspaceId'];
const MANIFEST_FIELDS = new Set(['schemaVersion', 'policyVersion', 'bindings', 'boundary', 'components', 'hash']);

function refusal(code, message) {
  return Object.assign(new Error(message), { code, status: 409 });
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        throw refusal('TOPOLOGY_SNAPSHOT_INVALID', 'Unsafe snapshot object key.');
      }
      sorted[key] = canonical(value[key]);
    }
    return sorted;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw refusal('TOPOLOGY_SNAPSHOT_INVALID', 'Snapshot contains a non-JSON value.');
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function bindings(context) {
  const result = {};
  for (const field of BINDING_FIELDS) {
    if (typeof context?.[field] !== 'string' || !context[field].trim()) {
      throw refusal('TOPOLOGY_SNAPSHOT_IDENTITY_REQUIRED', `Snapshot ${field} is required.`);
    }
    result[field] = context[field];
  }
  if (!plain(context.scope)) {
    throw refusal('TOPOLOGY_SNAPSHOT_SCOPE_REQUIRED', 'A scoped topology snapshot is required.');
  }
  return result;
}

function components(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 64) {
    throw refusal('TOPOLOGY_SNAPSHOT_COMPONENTS_INVALID', 'A topology snapshot needs 1 to 64 components.');
  }
  const seen = new Set();
  return input.map((item) => sealComponent(item, seen));
}

function validateComponent(item, seen) {
  if (!plain(item) || typeof item.id !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(item.id)
    || seen.has(item.id) || !STATUSES.has(item.status)) {
    throw refusal('TOPOLOGY_SNAPSHOT_COMPONENT_INVALID', 'Invalid or duplicate topology snapshot component.');
  }
  seen.add(item.id);
  validateComponentContents(item);
}

function validateComponentContents(item) {
  if (item.status === 'captured' && !Object.hasOwn(item, 'payload')) {
    throw refusal('TOPOLOGY_SNAPSHOT_COMPONENT_INVALID', `Captured component ${item.id} needs payload.`);
  }
  if (item.status !== 'captured' && Object.hasOwn(item, 'payload')) {
    throw refusal('TOPOLOGY_SNAPSHOT_COMPONENT_INVALID', `Component ${item.id} cannot carry captured payload.`);
  }
  if (item.status === 'reference-only' && !Object.hasOwn(item, 'reference')) {
    throw refusal('TOPOLOGY_SNAPSHOT_COMPONENT_INVALID', `Reference-only component ${item.id} needs a reference.`);
  }
  if (['unsupported', 'conflict'].includes(item.status) && !item.reason) {
    throw refusal('TOPOLOGY_SNAPSHOT_COMPONENT_INVALID', `Component ${item.id} needs a reason.`);
  }
}

function sealComponent(item, seen) {
  validateComponent(item, seen);
  const { hash: _hash, ...data } = item;
  const safe = canonical(data);
  const bytes = Buffer.byteLength(JSON.stringify(safe));
  if (bytes > 1024 * 1024) throw refusal('TOPOLOGY_SNAPSHOT_TOO_LARGE', `Component ${item.id} exceeds 1 MiB.`);
  return { ...safe, hash: digest(safe) };
}

function seal(context, capture) {
  if (!plain(capture) || !plain(capture.boundary)) {
    throw refusal('TOPOLOGY_SNAPSHOT_BOUNDARY_REQUIRED', 'Adapter must report a consistency boundary.');
  }
  const body = {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: capture.policyVersion || 1,
    bindings: bindings(context),
    boundary: canonical(capture.boundary),
    components: components(capture.components)
  };
  if (!Number.isInteger(body.policyVersion) || body.policyVersion < 1) {
    throw refusal('TOPOLOGY_SNAPSHOT_POLICY_INVALID', 'Invalid topology snapshot policy version.');
  }
  if (Buffer.byteLength(JSON.stringify(body)) > 4 * 1024 * 1024) {
    throw refusal('TOPOLOGY_SNAPSHOT_TOO_LARGE', 'Topology snapshot manifest exceeds 4 MiB.');
  }
  return { ...body, hash: digest(body) };
}

function verify(manifest, context) {
  if (!plain(manifest) || manifest.schemaVersion !== SCHEMA_VERSION || !plain(manifest.bindings)) {
    throw refusal('TOPOLOGY_SNAPSHOT_SCHEMA_INVALID', 'Unknown topology snapshot schema.');
  }
  if (Reflect.ownKeys(manifest).some((field) => !MANIFEST_FIELDS.has(field))) {
    throw refusal('TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED', 'Topology snapshot has unsealed manifest fields.');
  }
  const expected = bindings(context);
  if (BINDING_FIELDS.some((field) => manifest.bindings[field] !== expected[field])) {
    throw refusal('TOPOLOGY_SNAPSHOT_OWNER_MISMATCH', 'Topology snapshot identity mismatch.');
  }
  const body = { schemaVersion: manifest.schemaVersion, policyVersion: manifest.policyVersion,
    bindings: manifest.bindings, boundary: manifest.boundary, components: manifest.components };
  const checked = components(manifest.components);
  if (checked.some((item, index) => item.hash !== manifest.components[index].hash)
    || manifest.hash !== digest(body)) {
    throw refusal('TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED', 'Topology snapshot manifest hash mismatch.');
  }
  return manifest;
}

module.exports = { bindings, digest, refusal, seal, verify };
