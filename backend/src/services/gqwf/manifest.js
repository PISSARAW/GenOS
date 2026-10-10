'use strict';

const crypto = require('node:crypto');
const { normalizeRelativePath } = require('../pathSafety');
const { snapshotLimits } = require('../workspaceSnapshotCollect');

const POLICY = Object.freeze({ version: 2, projection: 'workspace-snapshot-v1', paths: 'portable-nfc', modes: 'sanitized-v1' });
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function normalizePath(value) {
  const result = normalizeRelativePath(value, 'GQWF path').normalize('NFC');
  for (const segment of result.split('/')) {
    if (segment.endsWith('.') || segment.endsWith(' ') || /[:<>"|?*\x00-\x1f]/.test(segment) || WINDOWS_RESERVED.test(segment)) {
      throw new Error(`GQWF path is not portable: ${value}`);
    }
  }
  return result;
}

function comparePaths(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function validateEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('GQWF manifest files must be an array.');
  const limits = snapshotLimits();
  if (entries.length > limits.maxFiles) throw new Error('GQWF manifest exceeds the file limit.');
  const seen = new Set();
  let total = 0;
  for (const entry of entries) {
    validateEntry(entry, limits);
    const folded = entry.path.toLowerCase();
    if (seen.has(folded)) throw new Error(`GQWF manifest has a portable path collision: ${entry.path}`);
    seen.add(folded);
    total += entry.size;
    if (total > limits.maxBytes) throw new Error('GQWF manifest exceeds the byte limit.');
  }
}

function validateEntry(entry, limits) {
  if (!entry || entry.path !== normalizePath(entry.path) || !/^[a-f0-9]{64}$/.test(entry.hash)) {
    throw new Error('GQWF manifest contains an invalid file entry.');
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > limits.maxFileBytes) {
    throw new Error('GQWF manifest contains an invalid file size.');
  }
  if (!Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) {
    throw new Error('GQWF manifest contains an invalid file mode.');
  }
}

function createManifest(entries) {
  const files = entries.map((entry) => ({ path: normalizePath(entry.path), hash: entry.hash,
    size: entry.size, mode: entry.mode }));
  files.sort(comparePaths);
  validateEntries(files);
  const manifest = { policy: POLICY, files };
  const serialized = JSON.stringify(manifest);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');
  return { hash, manifest, serialized };
}

function parseManifest(serialized, expectedHash) {
  const manifest = JSON.parse(serialized);
  if (JSON.stringify(manifest.policy) !== JSON.stringify(POLICY)) throw new Error('Unsupported GQWF projection policy.');
  const rebuilt = createManifest(manifest.files);
  if (rebuilt.serialized !== serialized || rebuilt.hash !== expectedHash) throw new Error('GQWF root integrity check failed.');
  return manifest;
}

module.exports = { POLICY, normalizePath, createManifest, parseManifest };
