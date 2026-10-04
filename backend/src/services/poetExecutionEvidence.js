"use strict";
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const snapshots = require('./workspaceSnapshotStore');
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function artifactEvidence(environment) {
  const relative = environment.artifactPath || 'solution.json';
  if (!snapshots.isSafeRelative(relative)) throw new Error('POET artifact path must remain inside the workspace');
  const file = await fs.realpath(path.join(environment.workspacePath, relative)).catch(() => null);
  if (!file) return null;
  const root = await fs.realpath(environment.workspacePath);
  if (!file.startsWith(root + path.sep)) throw new Error('POET artifact escaped workspace');
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 1048576) throw new Error('POET artifact exceeds file limits');
  return { path: relative.replaceAll('\\', '/'), sha256: hash(await fs.readFile(file)), size: stat.size };
}
async function isolateEnvironment(environment) {
  validateVerifierContract(environment);
  const db = environment.db || await require('../db').getDatabase();
  const snapshot = await snapshots.capture({ db,
    workspace: { id: environment.workspaceId, path: environment.workspacePath },
    label: 'POET baseline', reason: 'Isolate one execution', author: 'poet_engine' });
  const destination = path.join(environment.workspacePath, '.genos', 'poet-runs', crypto.randomUUID());
  try {
    const manifest = await snapshots.materialize({ ...snapshot, snapshot_hash: snapshot.snapshotHash }, destination);
    return { ...environment, db, workspacePath: destination, baselineManifest: manifest,
      baselineSnapshotHash: snapshot.snapshotHash };
  } catch (error) {
    const cleanupError = await fs.rm(destination, { recursive: true, force: true,
      maxRetries: 5, retryDelay: 100 }).then(() => null, (failure) => failure);
    if (cleanupError) error.message += `; cleanup failed: ${cleanupError.message}`;
    throw error;
  }
}
function validateVerifierContract(environment) {
  if (!hasVerifierContract(environment)) {
    throw new Error('POET requires a workspace, verifier command and protected verifier paths');
  }
  for (const name of environment.protectedPaths) {
    if (!snapshots.isSafeRelative(name)) throw new Error('POET protected path must remain inside workspace');
  }
  if (environment.protectedPaths.includes(environment.artifactPath || 'solution.json')) {
    throw new Error('POET artifact cannot replace a protected verifier path');
  }
}
function hasVerifierContract(environment) {
  return Boolean(environment?.workspacePath && environment.workspaceId
    && typeof environment.verifierCommand === 'string' && environment.verifierCommand.trim()
    && Array.isArray(environment.protectedPaths) && environment.protectedPaths.length);
}
async function bindSnapshot(snapshot, evidence, environment) {
  const manifest = await snapshots.readManifest({ ...snapshot, snapshot_hash: snapshot.snapshotHash },);
  const found = manifest.files.find((file) => file.path === evidence.path);
  if (!found || found.hash !== evidence.sha256) throw new Error('POET artifact is absent or changed in snapshot');
  for (const name of environment.protectedPaths || []) {
    const before = environment.baselineManifest.files.find((file) => file.path === name);
    const after = manifest.files.find((file) => file.path === name);
    if (!before || before.hash !== after?.hash) throw new Error(`POET verifier contract changed: ${name}`);
  }
  return { snapshotId: snapshot.id, snapshotHash: snapshot.snapshotHash, artifact: evidence };
}
async function environmentFingerprint(environment) {
  const files = await snapshots.collectFiles(environment.workspacePath);
  return hash(JSON.stringify({ goals: environment.goals, constraints: environment.constraints || {},
    files: files.map((file) => ({ path: file.path, hash: file.hash })) }));
}
module.exports = { artifactEvidence, isolateEnvironment, bindSnapshot, environmentFingerprint, validateVerifierContract };
