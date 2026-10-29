'use strict';

const { normalizeRelativePath } = require('../pathSafety');

function workerWriteScope(request, allowFileEdits) {
  if (allowFileEdits !== true) return {};
  const paths = request?.allowed_write_paths ?? request?.allowedWritePaths
    ?? request?.executionPolicy?.allowedWritePaths;
  if (!Array.isArray(paths)) throw new Error('authority-write-paths-required');
  return { allowedWritePaths: [...new Set(paths.map(normalizeWritePath))] };
}

function normalizeWritePath(value) {
  if (typeof value !== 'string') throw new Error('authority-write-path-invalid');
  const trimmed = value.trim();
  if (trimmed === '*') return '*';
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, '');
  return normalizeRelativePath(withoutTrailingSeparators, 'authority write path');
}

module.exports = { workerWriteScope, normalizeWritePath };
