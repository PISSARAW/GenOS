'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs').promises;
const path = require('node:path');
const policy = require('./strategyPromotionPolicyService');

function hash(contents) {
  if (contents === undefined || contents === null) return null;
  return crypto.createHash('sha256').update(contents).digest('hex');
}

async function plan(options) {
  const winner = await policy.resolveRealRoot(options.winnerWorkspaceRoot);
  const target = await policy.resolveRealRoot(options.targetWorkspaceRoot);
  policy.assertMergePreconditions(winner, target);
  const base = options.causalBaseWorkspaceRoot ? await policy.resolveRealRoot(options.causalBaseWorkspaceRoot) : null;
  const [winnerFiles, targetFiles, baseFiles] = await Promise.all([
    policy.readWorkspaceFiles(winner), policy.readWorkspaceFiles(target), base ? policy.readWorkspaceFiles(base) : null,
  ]);
  const result = policy.computeWorkspaceChanges(winnerFiles, targetFiles, baseFiles);
  if (result.conflicts.length) throw new Error(`PROMOTION_MERGE_CONFLICT: ${result.conflicts.join(', ')}`);
  return { target, changes: result.changes.map(change => ({
    relativePath: change.relativePath, before: hash(targetFiles.get(change.relativePath)), after: hash(change.contents),
    contents: change.contents ? change.contents.toString('base64') : null,
  })) };
}

async function readFile(filename) {
  try { return await fs.readFile(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function assertPreimage(spec, change) {
  const filename = await policy.safeDestination(spec.target, spec.target, change.relativePath);
  const current = hash(await readFile(filename));
  if (current !== change.before && current !== change.after) throw new Error('PROMOTION_MERGE_RECONCILIATION_REQUIRED');
  return { filename, current };
}

async function replaceFile(filename, contents) {
  const staging = path.join(path.dirname(filename), `.genos-promotion-${hash(Buffer.from(filename + hash(contents)))}.tmp`);
  const previous = await fs.lstat(filename).catch(() => null);
  try {
    await prepareStaging(staging, contents);
    if (previous) await fs.chmod(staging, previous.mode & 0o777);
    const handle = await fs.open(staging, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    await fs.rename(staging, filename);
  } finally { await fs.rm(staging, { force: true }); }
}

async function prepareStaging(staging, contents) {
  const existing = await fs.lstat(staging).catch(() => null);
  if (!existing) return fs.writeFile(staging, contents, { flag: 'wx' });
  if (!existing.isFile() || existing.isSymbolicLink() || hash(await readFile(staging)) !== hash(contents)) {
    throw new Error('PROMOTION_MERGE_STAGING_ALTERED');
  }
}

async function apply(spec) {
  if (await fs.realpath(spec.target) !== spec.target) throw new Error('PROMOTION_MERGE_ROOT_CHANGED');
  for (const change of spec.changes) await assertPreimage(spec, change);
  for (const change of spec.changes) {
    const current = await assertPreimage(spec, change);
    if (current.current === change.after) continue;
    if (change.contents === null) await fs.rm(current.filename, { force: true });
    else await replaceFile(current.filename, Buffer.from(change.contents, 'base64'));
    if (hash(await readFile(current.filename)) !== change.after) throw new Error('PROMOTION_MERGE_POSTIMAGE_MISMATCH');
  }
}

module.exports = { plan, apply };
