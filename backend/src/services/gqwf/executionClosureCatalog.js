'use strict';

const executionClosure = require('./executionClosure');
const metadataStore = require('./metadataStore');

const HASH = /^[a-f0-9]{64}$/;
const ENTRY_KEYS = ['closureHash', 'rootHash', 'manifest'];

function canonicalJson(value) { return JSON.stringify(value); }

function assertEntryShape(entry) {
  const validObject = entry && typeof entry === 'object' && !Array.isArray(entry);
  const keys = validObject ? Object.keys(entry).sort() : [];
  if (!validObject || canonicalJson(keys) !== canonicalJson([...ENTRY_KEYS].sort())) {
    throw new Error('GQWF catalog execution closure is invalid.');
  }
}

function parseEntry(entry, input) {
  assertEntryShape(entry);
  const valid = HASH.test(entry.closureHash || '') && HASH.test(entry.rootHash || '')
    && input.roots.has(entry.rootHash);
  if (!valid) throw new Error('GQWF catalog execution closure binding is invalid.');
  const manifest = executionClosure.parseManifest(canonicalJson(entry.manifest), {
    workspaceId: input.workspaceId,
    rootHash: entry.rootHash,
    closureHash: entry.closureHash
  });
  return { closureHash: entry.closureHash, rootHash: entry.rootHash, manifest };
}

async function entries(db, input) {
  const rows = await db.all(`SELECT closure_hash, root_hash, manifest_json
    FROM gqwf_execution_closures WHERE workspace_id = ? ORDER BY closure_hash`,
  input.workspaceId);
  const result = [];
  for (const row of rows) {
    const manifest = executionClosure.parseManifest(row.manifest_json, {
      workspaceId: input.workspaceId,
      rootHash: row.root_hash,
      closureHash: row.closure_hash
    });
    const stored = await metadataStore.putObject(input.workspacePath, row.manifest_json);
    if (stored !== row.closure_hash) {
      throw new Error('GQWF execution closure CAS identity changed.');
    }
    result.push({ closureHash: row.closure_hash, rootHash: row.root_hash, manifest });
  }
  return result;
}

function validateEntries(input) {
  const closures = input.entries.map((entry) => parseEntry(entry, input))
    .sort((left, right) => left.closureHash.localeCompare(right.closureHash));
  const hashes = closures.map((entry) => entry.closureHash);
  if (new Set(hashes).size !== hashes.length) {
    throw new Error('GQWF catalog has duplicate execution closure.');
  }
  return closures;
}

async function currentRows(db, workspaceId) {
  const rows = await db.all(`SELECT closure_hash, root_hash, manifest_json
    FROM gqwf_execution_closures WHERE workspace_id = ?`, workspaceId);
  return new Map(rows.map((row) => [row.closure_hash, row]));
}

function indexIssue(entry, row) {
  if (!row) return { type: 'missing_execution_closure', entityId: entry.closureHash };
  const matches = row.root_hash === entry.rootHash
    && row.manifest_json === canonicalJson(entry.manifest);
  return matches ? null
    : { type: 'divergent_execution_closure', entityId: entry.closureHash };
}

async function objectIssue(input, entry) {
  try {
    const serialized = await metadataStore.readObject(input.workspacePath, entry.closureHash);
    executionClosure.parseManifest(serialized, {
      workspaceId: input.workspaceId,
      rootHash: entry.rootHash,
      closureHash: entry.closureHash
    });
    return null;
  } catch (_) {
    return { type: 'invalid_execution_closure_object', entityId: entry.closureHash };
  }
}

async function issues(input) {
  const found = [];
  for (const entry of input.entries) {
    const indexed = indexIssue(entry, input.rows.get(entry.closureHash));
    found.push(indexed || await objectIssue(input, entry));
  }
  return found.filter(Boolean);
}

async function restore(db, input) {
  for (const entry of input.entries) {
    const serialized = canonicalJson(entry.manifest);
    const stored = await metadataStore.putObject(input.workspacePath, serialized);
    if (stored !== entry.closureHash) {
      throw new Error('GQWF catalog execution closure identity changed during repair.');
    }
    await db.run(`INSERT INTO gqwf_execution_closures
      (workspace_id, closure_hash, root_hash, manifest_json)
      VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, closure_hash) DO UPDATE SET
        root_hash = excluded.root_hash, manifest_json = excluded.manifest_json`,
    input.workspaceId, entry.closureHash, entry.rootHash, serialized);
  }
}

module.exports = { currentRows, entries, issues, restore, validateEntries };
