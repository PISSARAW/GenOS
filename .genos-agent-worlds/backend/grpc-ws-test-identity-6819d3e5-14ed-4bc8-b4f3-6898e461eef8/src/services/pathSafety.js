const path = require('path');

function resolveWorkspaceRoot(value, label = 'workspace root') {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new Error(`${label} must be an existing directory.`);
  }
  const resolved = path.resolve(value);
  const filesystemRoot = path.parse(resolved).root;
  if (resolved === filesystemRoot) throw new Error(`${label} must not be a filesystem root.`);
  const fs = require('fs');
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory.`);
  if (fs.realpathSync(resolved) !== resolved) throw new Error(`${label} must not be a symbolic link.`);
  return resolved;
}

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

function resolveContainedPathNoSymlinkSync(root, relativePath, label = 'path') {
  const resolvedRoot = path.resolve(root);
  const resolved = resolveContainedPath(resolvedRoot, relativePath, label);
  const realRoot = require('fs').realpathSync(resolvedRoot);
  let current = realRoot;
  const relative = path.relative(resolvedRoot, resolved);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (require('fs').lstatSync(current).isSymbolicLink()) throw new Error(`${label} traverses a symbolic link.`);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return resolved;
}

module.exports = { normalizeRelativePath, resolveContainedPath, resolveContainedPathNoSymlinkSync, resolveWorkspaceRoot };
