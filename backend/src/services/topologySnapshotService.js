'use strict';

const contract = require('./topologySnapshotContract');

const adapters = new Map();

function registerAdapter(topologyId, adapter) {
  if (typeof topologyId !== 'string' || !topologyId || typeof adapter?.capture !== 'function'
    || typeof adapter?.preflightRestore !== 'function') {
    throw contract.refusal('TOPOLOGY_SNAPSHOT_ADAPTER_INVALID', 'Snapshot adapter needs capture and preflightRestore.');
  }
  if (adapters.has(topologyId)) {
    throw contract.refusal('TOPOLOGY_SNAPSHOT_ADAPTER_DUPLICATE', `Snapshot adapter already registered: ${topologyId}.`);
  }
  adapters.set(topologyId, adapter);
}

function adapterFor(topologyId) {
  const adapter = adapters.get(topologyId);
  if (!adapter) {
    throw contract.refusal('TOPOLOGY_SNAPSHOT_ADAPTER_MISSING', `No snapshot adapter registered for ${topologyId}.`);
  }
  return adapter;
}

function assertReady(manifest) {
  const issue = manifest.components.find((item) => ['unsupported', 'conflict'].includes(item.status));
  if (issue) {
    throw contract.refusal('TOPOLOGY_SNAPSHOT_UNAVAILABLE', `${issue.id}: ${issue.reason}`);
  }
}

async function capture(context) {
  contract.bindings(context);
  if (!context.db) throw contract.refusal('TOPOLOGY_SNAPSHOT_DB_REQUIRED', 'A database is required.');
  const data = await adapterFor(context.topologyId).capture(context);
  const manifest = contract.seal(context, data);
  assertReady(manifest);
  return manifest;
}

function unchanged(manifest, current) {
  if (manifest.policyVersion !== current.policyVersion
    || contract.digest(manifest.boundary) !== contract.digest(current.boundary)
    || manifest.components.length !== current.components.length) return false;
  const byId = new Map(current.components.map((item) => [item.id, item]));
  return manifest.components.every((item) => {
    const now = byId.get(item.id);
    return now && now.status === item.status && now.hash === item.hash;
  });
}

async function preflightRestore(context) {
  const { manifest } = context;
  contract.verify(manifest, context);
  assertReady(manifest);
  const adapter = adapterFor(context.topologyId);
  const current = contract.seal(context, await adapter.capture(context));
  assertReady(current);
  if (!unchanged(manifest, current)) {
    throw contract.refusal('TOPOLOGY_SNAPSHOT_DRIFT', 'Topology state changed since capture; workspace restore refused.');
  }
  const result = await adapter.preflightRestore(context, manifest);
  if (!result || result.ok !== true) {
    const reason = result?.reasons?.join('; ') || 'Topology adapter refused restore.';
    throw contract.refusal('TOPOLOGY_SNAPSHOT_PREFLIGHT_REFUSED', reason);
  }
  return { allowed: true, restorable: false, plan: { type: 'verify-only',
    topologyId: context.topologyId, variantId: context.variantId, sessionId: context.sessionId,
    workerKind: context.workerKind,
    componentStatuses: manifest.components.map((item) => ({ id: item.id, status: item.status })) },
  adapterPlan: result.plan || null };
}

module.exports = { registerAdapter, capture, preflightRestore };
