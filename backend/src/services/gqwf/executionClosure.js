'use strict';

const metadataStore = require('./metadataStore');
const storage = require('./storage');

const PROTOCOL = 'gqwf-execution-closure-v1';
const HASH = /^[a-f0-9]{64}$/;
const MAX_ARGUMENTS = 256;
const MAX_ENTRIES = 2048;
const INPUT_KEYS = ['workspaceId', 'rootHash', 'command', 'runtime',
  'dependencies', 'environment'];

function canonicalJson(value) { return JSON.stringify(value); }

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`GQWF execution closure ${label} is invalid.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`GQWF execution closure ${label} has unsupported fields.`);
  }
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) {
    throw new Error(`GQWF execution closure ${label} is invalid.`);
  }
  return value;
}

function requiredHash(value, label) {
  if (!HASH.test(value || '')) {
    throw new Error(`GQWF execution closure ${label} must be a SHA-256 hash.`);
  }
  return value;
}

function normalizeCommand(value) {
  assertExactKeys(value, ['executable', 'arguments'], 'command');
  if (!Array.isArray(value.arguments) || value.arguments.length > MAX_ARGUMENTS) {
    throw new Error('GQWF execution closure arguments are invalid.');
  }
  return { executable: requiredText(value.executable, 'executable'),
    arguments: value.arguments.map((entry) => requiredText(entry, 'argument')) };
}

function normalizeRuntime(value) {
  assertExactKeys(value, ['name', 'version', 'digest'], 'runtime');
  return { name: requiredText(value.name, 'runtime name'),
    version: requiredText(value.version, 'runtime version'),
    digest: requiredHash(value.digest, 'runtime digest') };
}

function normalizeDependency(value) {
  assertExactKeys(value, ['name', 'version', 'digest'], 'dependency');
  return { name: requiredText(value.name, 'dependency name'),
    version: requiredText(value.version, 'dependency version'),
    digest: requiredHash(value.digest, 'dependency digest') };
}

function normalizeEnvironment(value) {
  assertExactKeys(value, ['name', 'valueHash'], 'environment entry');
  return { name: requiredText(value.name, 'environment name'),
    valueHash: requiredHash(value.valueHash, 'environment value hash') };
}

function normalizeList(value, config) {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) {
    throw new Error(`GQWF execution closure ${config.label} list is invalid.`);
  }
  const normalized = value.map(config.normalizer).sort((left, right) =>
    config.identity(left).localeCompare(config.identity(right)));
  const identities = normalized.map(config.identity);
  if (new Set(identities).size !== identities.length) {
    throw new Error(`GQWF execution closure has duplicate ${config.label}.`);
  }
  return normalized;
}

function buildManifest(input) {
  const stored = Boolean(input && typeof input === 'object' && !Array.isArray(input)
    && ('protocol' in input || 'assurance' in input));
  assertExactKeys(input, stored ? [...INPUT_KEYS, 'protocol', 'assurance'] : INPUT_KEYS,
    'manifest');
  requiredText(input.workspaceId, 'workspace ID');
  requiredHash(input.rootHash, 'root hash');
  return {
    protocol: PROTOCOL,
    workspaceId: input.workspaceId,
    rootHash: input.rootHash,
    command: normalizeCommand(input.command),
    runtime: normalizeRuntime(input.runtime),
    dependencies: normalizeList(input.dependencies, { normalizer: normalizeDependency,
      identity: (entry) => `${entry.name}\u0000${entry.version}\u0000${entry.digest}`,
      label: 'dependencies' }),
    environment: normalizeList(input.environment, { normalizer: normalizeEnvironment,
      identity: (entry) => entry.name, label: 'environment entries' }),
    assurance: {
      fileRoot: 'content-addressed',
      externalInputs: 'declared-only',
      sandbox: 'not-attested'
    }
  };
}

function parseManifest(serialized, expected) {
  let parsed;
  try { parsed = JSON.parse(serialized); } catch (_) {
    throw new Error('GQWF execution closure JSON is invalid.');
  }
  const rebuilt = buildManifest(parsed);
  const valid = rebuilt.protocol === PROTOCOL
    && rebuilt.workspaceId === expected.workspaceId
    && rebuilt.rootHash === expected.rootHash
    && canonicalJson(rebuilt) === serialized
    && metadataStore.digest(serialized) === expected.closureHash;
  if (!valid) throw new Error('GQWF execution closure integrity check failed.');
  return rebuilt;
}

async function persistIndex(db, input) {
  await db.run(`INSERT OR IGNORE INTO gqwf_execution_closures
    (workspace_id, closure_hash, root_hash, manifest_json) VALUES (?, ?, ?, ?)`,
  input.workspaceId, input.closureHash, input.rootHash, input.serialized);
  const row = await db.get(`SELECT root_hash, manifest_json FROM gqwf_execution_closures
    WHERE workspace_id = ? AND closure_hash = ?`, input.workspaceId, input.closureHash);
  if (!row || row.root_hash !== input.rootHash || row.manifest_json !== input.serialized) {
    throw new Error('GQWF execution closure index conflicts with its CAS object.');
  }
}

async function sealExecutionClosure(db, input) {
  await storage.root(db, input.workspaceId, input.rootHash);
  const manifest = buildManifest(input);
  const serialized = canonicalJson(manifest);
  const closureHash = await metadataStore.putObject(
    (await storage.workspace(db, input.workspaceId)).path, serialized);
  await persistIndex(db, { workspaceId: input.workspaceId, closureHash,
    rootHash: input.rootHash, serialized });
  return { protocol: PROTOCOL, workspaceId: input.workspaceId,
    rootHash: input.rootHash, closureHash, assurance: manifest.assurance };
}

async function inspectExecutionClosure(db, input) {
  requiredHash(input.closureHash, 'closure hash');
  const workspace = await storage.workspace(db, input.workspaceId);
  const serialized = await metadataStore.readObject(workspace.path, input.closureHash);
  const parsed = JSON.parse(serialized);
  const manifest = parseManifest(serialized, { workspaceId: input.workspaceId,
    rootHash: parsed.rootHash, closureHash: input.closureHash });
  await storage.root(db, input.workspaceId, manifest.rootHash);
  const row = await db.get(`SELECT root_hash, manifest_json FROM gqwf_execution_closures
    WHERE workspace_id = ? AND closure_hash = ?`, input.workspaceId, input.closureHash);
  if (row && (row.root_hash !== manifest.rootHash || row.manifest_json !== serialized)) {
    throw new Error('GQWF execution closure index conflicts with its CAS object.');
  }
  return { closureHash: input.closureHash, registered: Boolean(row), manifest };
}

module.exports = { PROTOCOL, buildManifest, inspectExecutionClosure, sealExecutionClosure };
