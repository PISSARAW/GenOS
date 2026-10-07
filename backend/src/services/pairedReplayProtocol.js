'use strict';

const values = require('./trinityProvenanceValues');
const registry = require('./proceduralRegistryService');
const VERSION = 'genos.paired-replay/v2';
const FIELDS = ['experiment_id', 'protocol_version', 'runner_id', 'runner_hash', 'environment_id', 'environment_hash'];
const JSON_FIELDS = ['snapshot_refs_json', 'snapshot_hashes_json', 'snapshot_states_json',
  'arms_json', 'seeds_json', 'environment_manifest_json', 'budget_json', 'analysis_json', 'replay_contract_json'];

function sourceHash(runner) {
  const source = Function.prototype.toString.call(runner);
  if (source.includes('[native code]')) fail('CAUSAL_RUNNER_SOURCE_UNAVAILABLE');
  return values.hashBytes(Buffer.from(source));
}
function enabled(row) { return row.protocol_version === VERSION; }
function fail(code) { throw values.failure(code); }

function validateContract(contract) {
  values.assertPublic(contract);
  values.clone(contract);
  if (contract?.schema !== VERSION || Object.keys(contract).some(key => !['schema', 'scope', 'events'].includes(key))) fail('CAUSAL_REPLAY_CONTRACT_INVALID');
  validateScope(contract.scope);
  if (!Array.isArray(contract.events) || contract.events.length < 1 || contract.events.length > 128) fail('CAUSAL_REPLAY_EVENTS_INVALID');
  const ids = new Set();
  for (const event of contract.events) {
    validateEvent(event);
    if (ids.has(event.id)) fail('CAUSAL_REPLAY_EVENT_DUPLICATE');
    ids.add(event.id);
  }
  if (Buffer.byteLength(values.encode(contract)) > 262144) fail('CAUSAL_REPLAY_CONTRACT_TOO_LARGE');
}

function validateScope(scope) {
  if (!scope || Object.keys(scope).length !== 3 || !['organizationId', 'projectId', 'entityId'].every(key => typeof scope[key] === 'string' && scope[key].trim())) fail('CAUSAL_REPLAY_SCOPE_INVALID');
}

function validateEvent(event) {
  if (!event || Object.keys(event).some(key => !['id', 'payload', 'slots'].includes(key))
      || typeof event.id !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(event.id)
      || !Object.hasOwn(event, 'payload') || !Number.isInteger(event.slots) || event.slots < 1 || event.slots > 16) fail('CAUSAL_REPLAY_EVENT_INVALID');
}

function projection(row) {
  return { fields: Object.fromEntries(FIELDS.map(key => [key, row[key]])),
    json: Object.fromEntries(JSON_FIELDS.map(key => [key, JSON.parse(row[key])])) };
}

function create(spec) {
  if (spec.protocolVersion !== VERSION) {
    if (spec.replayContract) fail('CAUSAL_REPLAY_VERSION_MISMATCH');
    return { contract: null, hash: null, runnerHash: spec.runnerHash || null };
  }
  validateContract(spec.replayContract);
  const runnerHash = sourceHash(registry.resolveRunner(spec.runnerId));
  if (spec.runnerHash && spec.runnerHash !== runnerHash) fail('CAUSAL_RUNNER_DRIFT');
  const environment = registry.resolveEnvironment(spec.environmentId);
  if (values.digest(environment) !== values.digest(spec.environmentManifest)) fail('CAUSAL_ENV_DRIFT');
  for (const snapshot of spec.snapshots) {
    if (values.digest(registry.resolveSnapshot(snapshot.snapshotId)) !== values.digest(snapshot.state)) fail('CAUSAL_SNAPSHOT_MISMATCH');
  }
  const row = { experiment_id: spec.experimentId, protocol_version: VERSION, runner_id: spec.runnerId, runner_hash: runnerHash,
    environment_id: spec.environmentId, environment_hash: values.digest(environment),
    snapshot_refs_json: values.encode(spec.snapshots.map(item => item.snapshotId)),
    snapshot_hashes_json: values.encode(Object.fromEntries(spec.snapshots.map(item => [item.snapshotId, values.digest(item.state)]))),
    snapshot_states_json: values.encode(Object.fromEntries(spec.snapshots.map(item => [item.snapshotId, item.state]))),
    arms_json: values.encode(spec.arms), seeds_json: values.encode(spec.seeds),
    environment_manifest_json: values.encode(environment), budget_json: values.encode(spec.budget),
    analysis_json: values.encode(spec.analysis), replay_contract_json: values.encode(spec.replayContract) };
  return { contract: row.replay_contract_json, hash: values.digest(projection(row)), runnerHash };
}

function verify(row, input) {
  if (!enabled(row)) {
    if (row.replay_contract_json || row.replay_protocol_hash) fail('CAUSAL_REPLAY_VERSION_MISMATCH');
    return null;
  }
  const contract = JSON.parse(row.replay_contract_json);
  validateContract(contract);
  if (values.digest(projection(row)) !== row.replay_protocol_hash) fail('CAUSAL_REPLAY_PROTOCOL_CHANGED');
  if (!require('./gvxContracts').sameScope(contract.scope, input.scope)) fail('CAUSAL_REPLAY_SCOPE_MISMATCH');
  return contract;
}

function verifyRunner(row, input) {
  if (!enabled(row)) return;
  if (sourceHash(input.runner) !== row.runner_hash || sourceHash(registry.resolveRunner(row.runner_id)) !== row.runner_hash) fail('CAUSAL_RUNNER_DRIFT');
  if (values.digest(registry.resolveEnvironment(row.environment_id)) !== row.environment_hash) fail('CAUSAL_ENV_DRIFT');
}

module.exports = { VERSION, sourceHash, enabled, create, verify, verifyRunner };
