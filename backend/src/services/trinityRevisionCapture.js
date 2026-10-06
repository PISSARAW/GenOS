'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const git = promisify(execFile);
const { isSensitivePath } = require('./agentWorkspaceLifecycle/constants');

async function capture(root) {
  try { return await captureGit(root); }
  catch (error) {
    return { commit: null, dirtyHash: null, status: 'unknown', reason: error.code || 'GIT_CAPTURE_UNAVAILABLE' };
  }
}

async function command(root, args) {
  return (await git('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024, windowsHide: true })).stdout;
}

async function captureGit(root) {
  const commit = (await command(root, ['rev-parse', 'HEAD'])).trim();
  const listing = await command(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const hash = crypto.createHash('sha256');
  const state = { hash, bytes: 0, files: 0 };
  for (const name of [...new Set(listing.split('\0').filter(Boolean))].sort()) {
    if (isSensitivePath(name)) continue;
    await hashFile(state, root, name);
  }
  if (commit !== (await command(root, ['rev-parse', 'HEAD'])).trim()) throw failure('GIT_REVISION_CHANGED');
  return { commit, dirtyHash: hash.digest('hex'), status: 'captured', files: state.files,
    scope: 'tracked-and-nonignored-untracked-files-excluding-sensitive-paths',
    consistency: 'filesystem-observation-not-atomic-snapshot' };
}

async function hashFile(state, root, name) {
  const file = path.resolve(root, name);
  state.hash.update(name.replace(/\\/g, '/')).update('\0');
  let before;
  try { before = await fs.lstat(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state.hash.update('deleted\0'); return; }
  if (before.isSymbolicLink()) state.hash.update(await fs.readlink(file));
  else if (before.isFile()) await hashContent(state, file, before);
  state.hash.update('\0');
  state.files += 1;
}

async function hashContent(state, file, before) {
  state.bytes += before.size;
  if (state.bytes > 128 * 1024 * 1024) throw failure('GIT_CAPTURE_BOUND_EXCEEDED');
  state.hash.update(await fs.readFile(file));
  const after = await fs.lstat(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw failure('GIT_WORKSPACE_CHANGED');
}
function failure(code) { return Object.assign(new Error(code), { code }); }
module.exports = { capture };
