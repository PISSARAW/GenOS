'use strict';

const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const stalenessBudget = require('./stalenessBudgetService');

const MAX_BUNDLE_BYTES = 32 * 1024 * 1024;

function createAntiEntropyService(syncytium) {
  return {
    encodeAntiEntropyBundle: (request) => encodeBundle(request),
    reconcileAntiEntropyBundle: (sessionId, bundle, options) => reconcileBundle({ sessionId, bundle, options, syncytium }),
    assessVariantStaleness: (sessionId, request) => assessStaleness(sessionId, request, syncytium)
  };
}

function encodeBundle(request = {}) {
  if (!request.sessionId || !isRecord(request.frontier) || !Array.isArray(request.operations)) {
    throw antiEntropyError('A bundle requires sessionId, frontier and operations.');
  }
  const payload = Buffer.from(JSON.stringify({
    version: 1, sessionId: request.sessionId, replicaId: request.replicaId,
    frontier: normalizeFrontier(request.frontier), operations: orderOperations(request.operations)
  }));
  if (payload.length > MAX_BUNDLE_BYTES) throw antiEntropyError('Anti-entropy bundle exceeds the uncompressed size limit.');
  const compressed = gzipSync(payload);
  return { algorithm: 'gzip-sha256', digest: digest(compressed), payload: compressed.toString('base64'), uncompressedBytes: payload.length };
}

async function reconcileBundle(context) {
  const { sessionId, bundle = {}, options = {}, syncytium } = context;
  const packet = decodeBundle(bundle);
  if (packet.sessionId !== sessionId || !packet.replicaId) throw antiEntropyError('Bundle session or replica identity does not match.');
  return syncytium.reconcileReplica(sessionId, packet.replicaId, { frontier: packet.frontier,
    operations: packet.operations, options });
}

function decodeBundle(bundle) {
  if (bundle.algorithm !== 'gzip-sha256' || typeof bundle.payload !== 'string' || bundle.payload.length > MAX_BUNDLE_BYTES) {
    throw antiEntropyError('Unsupported or oversized anti-entropy bundle.');
  }
  const compressed = Buffer.from(bundle.payload, 'base64');
  if (digest(compressed) !== bundle.digest) throw antiEntropyError('Anti-entropy bundle digest mismatch.');
  let packet;
  try {
    packet = JSON.parse(gunzipSync(compressed, { maxOutputLength: MAX_BUNDLE_BYTES }).toString('utf8'));
  } catch (_) {
    throw antiEntropyError('Anti-entropy bundle payload is invalid or exceeds the decompression limit.');
  }
  if (packet.version !== 1 || !isRecord(packet.frontier) || !Array.isArray(packet.operations)) {
    throw antiEntropyError('Anti-entropy bundle payload has an unsupported shape.');
  }
  return packet;
}

async function assessStaleness(sessionId, request = {}, syncytium) {
  const snapshot = await syncytium.snapshot(sessionId, request.options || {});
  const field = snapshot.schema.fields[request.path];
  const domain = snapshot.domains[request.domainId];
  if (!field || !domain) throw antiEntropyError('Staleness assessment requires a known field path and domain.');
  return stalenessBudget.assess({ domain, field, path: request.path, telemetry: request.telemetry || {}, nowMs: request.nowMs });
}

function normalizeFrontier(frontier) {
  return Object.fromEntries(Object.entries(frontier).map(([actor, sequence]) => {
    if (!actor || !Number.isSafeInteger(sequence) || sequence < 0) throw antiEntropyError('Causal frontier entries must be non-negative safe integers.');
    return [actor, sequence];
  }));
}

function orderOperations(operations) {
  return [...operations].sort((left, right) => Number(left.lamport || 0) - Number(right.lamport || 0)
    || String(left.actorId || '').localeCompare(String(right.actorId || ''))
    || String(left.opId || '').localeCompare(String(right.opId || '')));
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function antiEntropyError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_ANTI_ENTROPY_INVALID' });
}

module.exports = { createAntiEntropyService };
