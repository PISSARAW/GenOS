'use strict';

const { normalizeRelativePath, resolveContainedPathNoSymlinkSync } = require('../pathSafety');

function pathAllowed(authority, file) {
  try {
    const normalized = normalizeRelativePath(file);
    return ((authority && authority.paths) || []).some((prefix) => matchesPrefix(prefix, normalized));
  } catch (_) {
    return false;
  }
}

function matchesPrefix(prefix, file) {
  if (prefix === '*') return true;
  const normalized = normalizeRelativePath(String(prefix).replace(/[\\/]+$/, ''));
  return file === normalized || file.startsWith(`${normalized}/`);
}

function assertContainedFiles(root, files) {
  return files.map((file) => resolveContainedPathNoSymlinkSync(root, file, 'candidate path'));
}

module.exports = { pathAllowed, assertContainedFiles };
