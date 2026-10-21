'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function pathApi(platform) {
  return platform === 'win32' ? path.win32 : path;
}

function absoluteRoot(value, platform) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const api = pathApi(platform);
  if (!api.isAbsolute(value)) return null;
  return api.resolve(value);
}

function normalizedRoot(value, platform) {
  return value ? pathApi(platform).normalize(value) : null;
}

function comparisonKey(value, platform = process.platform) {
  const normalized = normalizedRoot(value, platform);
  if (!normalized) return null;
  let key = platform === 'win32' ? normalized.toLowerCase() : normalized;
  // Uniformiser les séparateurs de chemin pour éviter les faux négatifs entre
  // slash et backslash sur Windows (ex: C:/foo vs C:\foo).
  if (platform === 'win32') key = key.replace(/\//g, '\\');
  return key;
}

function canonicalWorkspaceRoot(value, options = {}) {
  const platform = options.platform || process.platform;
  const absolute = absoluteRoot(value, platform);
  if (!absolute) return null;
  const resolve = options.realpath || fs.realpathSync.native;
  try { return normalizedRoot(resolve(absolute), platform); }
  catch (error) {
    if (!['ENOENT', 'EPERM', 'EBUSY'].includes(error.code)) throw error;
    return normalizedRoot(absolute, platform);
  }
}

function retryable(error) {
  return ['EPERM', 'EBUSY'].includes(error.code);
}

async function resolveWithRetry(input) {
  for (let attempt = 0; attempt < input.attempts; attempt += 1) {
    try { return await input.resolve(input.value); }
    catch (error) {
      if (!retryable(error)) throw error;
      if (attempt === input.attempts - 1) return null;
      await new Promise((done) => setTimeout(done, 25 * (attempt + 1)));
    }
  }
  return null;
}

async function canonicalWorkspaceRootAsync(value, options = {}) {
  const platform = options.platform || process.platform;
  if (typeof value !== 'string' || !value.trim()) return null;
  const resolved = await resolveWithRetry({ value, resolve: options.resolve || fsp.realpath,
    attempts: options.attempts ?? 1 });
  if (resolved) return normalizedRoot(resolved, platform);
  const validate = options.validate || require('./workspaceSnapshotPaths').assertNoSymlinkAbsolutePath;
  return normalizedRoot(await validate(value), platform);
}

function workspaceIdentity(input, options = {}) {
  const workspaceRoot = canonicalWorkspaceRoot(input?.workspaceRoot, options);
  const workspaceId = typeof input?.workspaceId === 'string' && input.workspaceId ? input.workspaceId : null;
  return { workspaceId, workspaceRoot, comparisonKey: comparisonKey(workspaceRoot, options.platform) };
}

function sameWorkspaceRoot(left, right, options = {}) {
  const roots = [canonicalWorkspaceRoot(left, options), canonicalWorkspaceRoot(right, options)];
  return Boolean(roots[0] && roots[1]
    && comparisonKey(roots[0], options.platform) === comparisonKey(roots[1], options.platform));
}

function sameWorkspaceIdentity(left, right, options = {}) {
  const identities = [workspaceIdentity(left, options), workspaceIdentity(right, options)];
  const idsMatch = identities[0].workspaceId === identities[1].workspaceId;
  return idsMatch && Boolean(identities[0].comparisonKey
    && identities[0].comparisonKey === identities[1].comparisonKey);
}

module.exports = {
  canonicalWorkspaceRoot,
  canonicalWorkspaceRootAsync,
  comparisonKey,
  sameWorkspaceIdentity,
  sameWorkspaceRoot,
  workspaceIdentity
};
