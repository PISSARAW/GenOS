'use strict';

const { withTransaction } = require('../../db');
const { importWorkspace } = require('./import');
const { createManifest } = require('./manifest');
const storage = require('./storage');

async function importBase(db, input) {
  const workspace = await storage.workspace(db, input.workspaceId);
  const built = await importWorkspace(workspace.path);
  await storage.putRoot(db, input.workspaceId, built);
  return { rootHash: built.hash, fileCount: built.manifest.files.length };
}

function sameFile(left, right) {
  if (!left || !right) return left === right;
  return left.hash === right.hash && left.size === right.size && left.mode === right.mode;
}

function mergeFiles(base, candidate, current) {
  const baseFiles = new Map(base.files.map((file) => [file.path, file]));
  const candidateFiles = new Map(candidate.files.map((file) => [file.path, file]));
  const currentFiles = new Map(current.files.map((file) => [file.path, file]));
  const paths = new Set([...baseFiles.keys(), ...candidateFiles.keys(), ...currentFiles.keys()]);
  const merged = [];
  const conflicts = [];
  for (const filePath of [...paths].sort()) {
    const original = baseFiles.get(filePath);
    const proposed = candidateFiles.get(filePath);
    const latest = currentFiles.get(filePath);
    const chosen = sameFile(proposed, original) ? latest :
      sameFile(latest, original) || sameFile(proposed, latest) ? proposed : null;
    if (chosen === null) conflicts.push(filePath);
    else if (chosen) merged.push(chosen);
  }
  return { merged, conflicts };
}

async function mergeRoots(db, input) {
  const [base, candidate, current] = await Promise.all([
    storage.root(db, input.workspaceId, input.baseHash),
    storage.root(db, input.workspaceId, input.candidateHash),
    storage.root(db, input.workspaceId, input.currentHash)
  ]);
  const result = mergeFiles(base, candidate, current);
  if (result.conflicts.length) return { merged: false, conflicts: result.conflicts };
  const built = createManifest(result.merged);
  await storage.putRoot(db, input.workspaceId, built);
  return { merged: true, rootHash: built.hash, conflicts: [] };
}

async function getHead(db, input) {
  const row = await db.get('SELECT root_hash, generation FROM gqwf_heads WHERE workspace_id = ? AND name = ?', input.workspaceId, input.name);
  if (!row) throw new Error('GQWF head not found.');
  return { rootHash: row.root_hash, generation: row.generation };
}

async function initializeHead(db, input) {
  await storage.root(db, input.workspaceId, input.rootHash);
  const inserted = await db.run('INSERT OR IGNORE INTO gqwf_heads (workspace_id, name, root_hash) VALUES (?, ?, ?)',
    input.workspaceId, input.name, input.rootHash);
  if (inserted.changes !== 1) throw new Error('GQWF head already exists.');
  return { rootHash: input.rootHash, generation: 0 };
}

async function publishCandidate(db, input, verifier) {
  if (typeof verifier !== 'function') throw new Error('GQWF promotion verifier is unavailable.');
  await storage.root(db, input.workspaceId, input.candidateHash);
  const verdict = await verifier(input);
  if (verdict?.success !== true || verdict.candidateHash !== input.candidateHash || !verdict.evidenceId) {
    throw new Error('GQWF promotion lacks verified candidate evidence.');
  }
  return withTransaction(db, async () => {
    const changed = await db.run(`UPDATE gqwf_heads SET root_hash = ?, generation = generation + 1
      WHERE workspace_id = ? AND name = ? AND root_hash = ? AND generation = ?`,
    input.candidateHash, input.workspaceId, input.name, input.expectedHash, input.expectedGeneration);
    if (changed.changes !== 1) throw new Error('GQWF head changed before promotion.');
    const generation = input.expectedGeneration + 1;
    await db.run(`INSERT INTO gqwf_head_events
      (workspace_id, name, generation, previous_hash, root_hash, evidence_id) VALUES (?, ?, ?, ?, ?, ?)`,
    input.workspaceId, input.name, generation, input.expectedHash, input.candidateHash, verdict.evidenceId);
    return { rootHash: input.candidateHash, generation, evidenceId: verdict.evidenceId };
  });
}

module.exports = { importBase, mergeFiles, mergeRoots, getHead, initializeHead, publishCandidate };
