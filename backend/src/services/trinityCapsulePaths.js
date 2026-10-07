const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fail(message) {
  throw Object.assign(new Error(message), { code: 'TRINITY_CAPSULE_INVALID' });
}

function correlation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Capsule correlation is required.');
  const result = {};
  for (const key of ['missionId', 'worldId', 'workerId', 'runId']) {
    result[key] = requiredValue(input[key], key);
  }
  for (const key of ['parentId', 'trinityExperimentId', 'workspaceId', 'tenantId']) {
    result[key] = optionalValue(input[key], key);
  }
  return result;
}

function requiredValue(value, key) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) fail(`Invalid capsule ${key}.`);
  return value;
}

function optionalValue(value, key) {
  if (value != null && (typeof value !== 'string' || value.length > 256)) fail(`Invalid capsule ${key}.`);
  return value || null;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function contained(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('Capsule path escapes its root.');
  return path.resolve(target);
}

function assertPath(target) {
  const resolved = path.resolve(target);
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') return resolved; throw error; }
    if (stat.isSymbolicLink()) fail('Capsule path traverses a symbolic link or junction.');
  }
  return resolved;
}

function ensureDirectory(target) {
  const resolved = assertPath(target);
  fs.mkdirSync(resolved, { recursive: true });
  assertPath(resolved);
  return resolved;
}

function resolve(context, paths) {
  if (!context.correlation) return paths;
  const scope = correlation(context.correlation);
  if (scope.workerId !== paths.agentId) fail('Capsule worker identity mismatch.');
  const base = path.join(paths.capsuleRoot, '.genos-runtime', 'trinity');
  const root = contained(paths.capsuleRoot, path.join(base, hash(scope)));
  const bootstrap = path.join(root, 'bootstrap', paths.agentId);
  return { ...paths, root, bootstrap, correlation: scope,
    genomePath: path.join(bootstrap, 'genome.json'), snapshotPath: path.join(bootstrap, 'snapshot.json') };
}

module.exports = { correlation, hash, fail, contained, assertPath, ensureDirectory, resolve };
