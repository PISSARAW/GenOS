'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const MAX_FILES = 16;
const MAX_BYTES = 1024 * 1024;

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertConfined(root, target) {
  if (!inside(root, target)) throw new Error('Observation dependency escapes the workspace.');
  const relative = path.relative(root, target);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Observation dependency contains a symbolic link.');
    if (!inside(root, fs.realpathSync(current))) throw new Error('Observation dependency resolves outside the workspace.');
  }
}

function resolveDependencies(workspaceRoot, files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) {
    throw new Error(`Continuous execution requires 1 to ${MAX_FILES} dependency files.`);
  }
  const root = fs.realpathSync(workspaceRoot);
  return [...new Set(files.map((file) => resolveFile(root, file)))].map((target) => ({
    root, target, relativePath: path.relative(root, target).replaceAll('\\', '/')
  }));
}

function resolveFile(root, file) {
  if (typeof file !== 'string' || !file.trim() || path.isAbsolute(file)) {
    throw new Error('Observation dependencies must be relative file paths.');
  }
  const target = path.resolve(root, file);
  assertConfined(root, target);
  return target;
}

function sample(dependency) {
  assertConfined(dependency.root, dependency.target);
  try {
    return readSample(dependency);
  } catch (error) {
    if (error.code === 'ENOENT') return { target: dependency.relativePath, digest: 'missing', bytes: 0 };
    throw error;
  }
}

function readSample(dependency) {
  const descriptor = fs.openSync(dependency.target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    assertConfined(dependency.root, dependency.target);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Dependency must be a file of at most 1 MiB.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytes > MAX_BYTES) throw new Error('Dependency grew beyond its observation limit.');
    return { target: dependency.relativePath, digest: createHash('sha256').update(buffer.subarray(0, bytes)).digest('hex'), bytes };
  } finally {
    fs.closeSync(descriptor);
  }
}

module.exports = { resolveDependencies, sample, MAX_FILES, MAX_BYTES };
