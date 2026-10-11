'use strict';

const snapshots = require('./workspaceSnapshotCollect');
const { isSafeRelative } = require('./workspaceSnapshotPaths');
const receipts = require('./bodyActionReceiptService');
const LIMITS = Object.freeze({ maxFiles: 5000, maxBytes: 128 * 1024 * 1024,
  maxFileBytes: 16 * 1024 * 1024 });

function fileChanges(before, after) {
  const oldFiles = new Map(before.map((entry) => [entry.path, `${entry.hash}:${entry.mode}`]));
  const newFiles = new Map(after.map((entry) => [entry.path, `${entry.hash}:${entry.mode}`]));
  const paths = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort();
  return paths.filter((file) => oldFiles.get(file) !== newFiles.get(file)).map((file) => ({
    path: file, kind: !oldFiles.has(file) ? 'created' : !newFiles.has(file) ? 'deleted' : 'modified'
  }));
}

async function begin(input) {
  const actionId = receipts.actionId();
  const identity = { db: input.db, agentId: input.agentId, runId: input.runId,
    effectorId: 'local_runtime_filesystem', actionId };
  await receipts.predict({ ...identity, prediction: { workspaceRoot: input.workspaceRoot,
    scope: 'snapshot_eligible_files', expected: 'before_after_manifest' } });
  try {
    return { ...identity, workspaceRoot: input.workspaceRoot,
      before: await snapshots.collectFiles(input.workspaceRoot, LIMITS), writes: [] };
  } catch (error) {
    await receipts.observe({ ...identity, outcome: { status: 'unobserved', stage: 'before',
      code: error.code || 'WORKSPACE_CAPTURE_FAILED' } });
    return null;
  }
}

async function finish(input) {
  if (!input) return null;
  let outcome;
  try {
    const after = await snapshots.collectFiles(input.workspaceRoot, LIMITS);
    const changes = fileChanges(input.before, after);
    const finalFiles = new Map(after.map((entry) => [entry.path, entry.hash]));
    const directWrites = input.writes.filter((write) => finalFiles.get(write.path) === write.hash);
    const directPaths = new Set(directWrites.map((write) => write.path));
    outcome = { status: 'observed', causality: 'temporal_only',
      observationAttested: false, scope: 'snapshot_eligible_files',
      beforeHash: snapshots.manifestHash(input.before), afterHash: snapshots.manifestHash(after),
      changedCount: changes.length, changes: changes.slice(0, 100), truncated: changes.length > 100,
      directWrites: directWrites.slice(0, 100),
      unattributedChanges: changes.filter((change) => !directPaths.has(change.path)).slice(0, 100) };
  } catch (error) {
    outcome = { status: 'unobserved', stage: 'after', code: error.code || 'WORKSPACE_CAPTURE_FAILED' };
  }
  await receipts.observe({ ...input, outcome });
  return outcome;
}

function recordDirectWrite(input, message) {
  if (!input || message?.kind !== 'genos.runtime.file-write/v1'
    || !isSafeRelative(message.path) || !/^[a-f0-9]{64}$/.test(message.hash || '')
    || input.writes.length >= 1000) return false;
  const path = require('node:path');
  const normalized = path.normalize(message.path);
  input.writes.push({ path: normalized.replaceAll('\\', '/'), hash: message.hash,
    source: 'solar_direct_write_actuator' });
  return true;
}

async function fail(input, code) {
  if (!input) return;
  await receipts.observe({ ...input, outcome: { status: 'unobserved', stage: 'spawn', code } });
}

module.exports = { begin, finish, fail, fileChanges, recordDirectWrite };
