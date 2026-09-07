const path = require('path');

function normalizeRelativePath(value, label = 'path') {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  const normalized = value.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.startsWith('\\\\')
  ) {
    throw new Error(`${label} must stay relative to its workspace.`);
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} contains an unsafe path segment.`);
  }
  return segments.join('/');
}

function resolveContainedPath(root, relativePath, label = 'path') {
  const normalized = normalizeRelativePath(relativePath, label);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, normalized);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes its workspace.`);
  }
  return resolved;
}

module.exports = { normalizeRelativePath, resolveContainedPath };
