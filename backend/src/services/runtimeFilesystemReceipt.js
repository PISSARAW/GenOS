'use strict';

const snapshots = require('./workspaceSnapshotCollect');
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
      before: await snapshots.collectFiles(input.workspaceRoot, LIMITS) };
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
    outcome = { status: 'observed', causality: 'temporal_only',
      observationAttested: false, scope: 'snapshot_eligible_files',
      beforeHash: snapshots.manifestHash(input.before), afterHash: snapshots.manifestHash(after),
      changedCount: changes.length, changes: changes.slice(0, 100), truncated: changes.length > 100 };
  } catch (error) {
    outcome = { status: 'unobserved', stage: 'after', code: error.code || 'WORKSPACE_CAPTURE_FAILED' };
  }
  await receipts.observe({ ...input, outcome });
  return outcome;
}

async function fail(input, code) {
  if (!input) return;
  await receipts.observe({ ...input, outcome: { status: 'unobserved', stage: 'spawn', code } });
}

module.exports = { begin, finish, fail, fileChanges };
