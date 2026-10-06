'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EXCLUDED = new Set(['node_modules', '.git', '.genos', 'dist', 'build', 'target', 'coverage', '.next', 'vendor']);

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function excludedPath(file) {
  return file.split('/').some((part) => EXCLUDED.has(part) || part.startsWith('.genos-'));
}

function lexicalFile(rootPath, file, scopePath = '/') {
  if (typeof file !== 'string' || !file || file.includes('\0')) return null;
  const normalized = file.replaceAll('\\', '/');
  if (path.isAbsolute(file) || /^[A-Za-z]:/.test(file) || normalized.split('/').includes('..')) return null;
  if (excludedPath(normalized)) return null;
  const root = path.resolve(rootPath);
  const scope = path.resolve(root, scopePath.replace(/^[/\\]+/, ''));
  const absolute = path.resolve(root, normalized);
  return within(root, scope) && within(scope, absolute) ? { root, absolute } : null;
}

function realAncestor(file) {
  let candidate = file;
  while (!fs.existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
  return fs.realpathSync(candidate);
}

function safeFile(rootPath, file, scopePath = '/') {
  const resolved = lexicalFile(rootPath, file, scopePath);
  if (!resolved) return false;
  try {
    const root = fs.realpathSync(resolved.root);
    const actual = realAncestor(resolved.absolute);
    return Boolean(actual && within(root, actual));
  } catch (_) { return false; }
}

function validScope(rootPath, scopePath = '/') {
  try {
    const root = fs.realpathSync(rootPath);
    const scope = fs.realpathSync(path.resolve(root, scopePath.replace(/^[/\\]+/, '')));
    return within(root, scope) && fs.statSync(scope).isDirectory();
  } catch (_) { return false; }
}

module.exports = { safeFile, validScope, EXCLUDED };
