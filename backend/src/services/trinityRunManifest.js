'use strict';
const { withTransaction } = require('../db');
const values = require('./trinityProvenanceValues');
const VERSION = 'genos.trinity-run-manifest/v1';
const INPUTS = ['originalMission', 'contract', 'publicPrompt', 'fixture', 'verifier'];
const WORKER_FIELDS = ['workerId', 'worldId', 'parentId', 'tenantId', 'workspaceRoot',
  'snapshotId', 'snapshotHash', 'role', 'workerKind', 'hypothesisHash', 'worldNumber',
  'chamber', 'modelTier', 'requestedModel'];

function sourceHash(input, name) {
  const explicit = input.inputHashes?.[name];
  if (explicit !== undefined) return values.requireHash(explicit);
  if (input[name] === undefined) return null;
  if (typeof input[name] === 'string' || Buffer.isBuffer(input[name])) return values.hashBytes(input[name]);
  return values.digest(input[name]);
}

function revision(input = {}) {
  if (input.commit != null && !/^[a-f0-9]{40,64}$/.test(input.commit)) {
    throw values.failure('TRINITY_MANIFEST_INVALID_COMMIT');
  }
  return { commit: input.commit ?? null, dirtyHash: optionalHash(input.dirtyHash),
    status: input.commit ? 'captured' : 'unknown', scope: input.scope ?? null,
    consistency: input.consistency ?? null, reason: input.reason ?? null, files: input.files ?? null };
}

function optionalHash(value) { return value == null ? null : values.requireHash(value); }

function observation(input) {
  if (input === undefined || input.status === 'unknown') return { status: 'unknown', values: null, evidence: null };
  const evidence = input.evidence;
  if (!evidence || !evidence.source || !evidence.observedAt || !evidence.sha256) {
    throw values.failure('TRINITY_MANIFEST_OBSERVATION_EVIDENCE_REQUIRED');
  }
  if (!['runtime-launcher', 'process-supervisor', 'provider-response'].includes(evidence.emitter)) {
    throw values.failure('TRINITY_MANIFEST_UNTRUSTED_OBSERVATION_EMITTER');
  }
  values.assertPublic(input.values);
  return { status: 'observed', values: values.clone(input.values), evidence: {
    source: String(evidence.source), sha256: values.requireHash(evidence.sha256),
    observedAt: values.utc(evidence.observedAt), clock: 'emitter-utc', emitter: evidence.emitter } };
}

function worker(input) {
  const result = Object.fromEntries(WORKER_FIELDS.map(key => [key, input[key] ?? null]));
  result.requestedRuntime = values.clone(input.requestedRuntime ?? {});
  result.observedRuntime = observation(input.observedRuntime);
  values.assertPublic(result);
  return result;
}

function lease(input) {
  if (typeof input.id !== 'string' || !input.id) throw values.failure('TRINITY_MANIFEST_INVALID_LEASE');
  const result = { id: input.id, sha256: values.requireHash(input.sha256), toolIds: input.toolIds ?? [] };
  if (!Array.isArray(result.toolIds) || result.toolIds.some(id => typeof id !== 'string')) {
    throw values.failure('TRINITY_MANIFEST_INVALID_LEASE');
  }
  return values.clone(result);
}

function build(input) {
  values.assertPublic(input.requestedRuntime ?? {});
  const payload = {
    correlation: values.correlation(input.correlation ?? input), revision: revision(input.revision),
    inputHashes: Object.fromEntries(INPUTS.map(name => [name, sourceHash(input, name)])),
    requestedRuntime: values.clone(input.requestedRuntime ?? {}), observedRuntime: observation(input.observedRuntime),
    workers: (input.workers ?? []).map(worker), toolLeases: (input.toolLeases ?? []).map(lease),
    timestamp: { value: values.utc(input.timestamp), qualification: 'manifest-created', clock: 'emitter-utc' }
  };
  const manifest = { schema: VERSION, algorithm: 'sha256', canonicalization: 'genos-json/v1', payload };
  return { ...manifest, hash: values.digest(manifest) };
}

function verify(manifest) {
  assertKeys(manifest, ['schema', 'algorithm', 'canonicalization', 'payload', 'hash']);
  if (manifest?.schema !== VERSION || manifest.algorithm !== 'sha256' || manifest.canonicalization !== 'genos-json/v1') {
    throw values.failure('TRINITY_MANIFEST_UNSUPPORTED_VERSION');
  }
  const { hash, ...content } = manifest;
  if (values.digest(content) !== hash) throw values.failure('TRINITY_MANIFEST_CORRUPT');
  validatePayload(manifest.payload);
  if (Buffer.byteLength(values.encode(manifest)) > 2 * 1024 * 1024) throw values.failure('TRINITY_MANIFEST_TOO_LARGE');
  return true;
}

function validatePayload(payload) {
  assertKeys(payload, ['correlation', 'revision', 'inputHashes', 'requestedRuntime', 'observedRuntime',
    'workers', 'toolLeases', 'timestamp']);
  assertKeys(payload.inputHashes, INPUTS);
  const normalized = { correlation: values.correlation(payload.correlation), revision: revision(payload.revision),
    inputHashes: Object.fromEntries(INPUTS.map(name => [name, optionalHash(payload.inputHashes[name])])),
    requestedRuntime: values.clone(payload.requestedRuntime), observedRuntime: observation(payload.observedRuntime),
    workers: payload.workers.map(worker), toolLeases: payload.toolLeases.map(lease),
    timestamp: { value: values.utc(payload.timestamp.value), qualification: 'manifest-created', clock: 'emitter-utc' } };
  values.assertPublic(normalized);
  if (values.encode(normalized) !== values.encode(payload)) throw values.failure('TRINITY_MANIFEST_INVALID_SHAPE');
}

function assertKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw values.failure('TRINITY_MANIFEST_INVALID_SHAPE');
  if (values.encode(Object.keys(value).sort()) !== values.encode([...keys].sort())) {
    throw values.failure('TRINITY_MANIFEST_INVALID_SHAPE');
  }
}

function compare(expected, actual) {
  verify(expected);
  verify(actual);
  if (values.encode(expected) !== values.encode(actual)) throw values.failure('TRINITY_REPLAY_MANIFEST_CHANGED');
  return true;
}

async function initialize(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS trinity_run_manifests (
    mission_id TEXT NOT NULL, run_id TEXT NOT NULL, manifest_hash TEXT NOT NULL,
    manifest_json TEXT NOT NULL, PRIMARY KEY(mission_id, run_id));
    CREATE TRIGGER IF NOT EXISTS trinity_manifest_no_update BEFORE UPDATE ON trinity_run_manifests
      BEGIN SELECT RAISE(ABORT, 'TRINITY_MANIFEST_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS trinity_manifest_no_delete BEFORE DELETE ON trinity_run_manifests
      BEGIN SELECT RAISE(ABORT, 'TRINITY_MANIFEST_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS trinity_manifest_no_replace BEFORE INSERT ON trinity_run_manifests
      WHEN EXISTS(SELECT 1 FROM trinity_run_manifests WHERE mission_id=NEW.mission_id AND run_id=NEW.run_id)
      BEGIN SELECT RAISE(ABORT, 'TRINITY_MANIFEST_IMMUTABLE'); END;`);
}

async function read(db, input) {
  const key = input.correlation ?? input;
  const row = await db.get('SELECT manifest_json, manifest_hash FROM trinity_run_manifests WHERE mission_id=? AND run_id=?',
    key.missionId, key.runId);
  if (!row) return null;
  const result = JSON.parse(row.manifest_json);
  verify(result);
  if (row.manifest_hash !== result.hash) throw values.failure('TRINITY_MANIFEST_CORRUPT');
  return result;
}

async function persist(db, manifest) {
  manifest = values.clone(manifest);
  verify(manifest);
  await initialize(db);
  return withTransaction(db, async () => {
    const existing = await read(db, manifest.payload);
    if (existing) { compare(existing, manifest); return existing; }
    const { missionId, runId } = manifest.payload.correlation;
    await db.run('INSERT INTO trinity_run_manifests VALUES (?, ?, ?, ?)',
      [missionId, runId, manifest.hash, values.encode(manifest)]);
    return values.clone(manifest);
  });
}

module.exports = { build, create: build, verify, compare, initialize, persist, read };
