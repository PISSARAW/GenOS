/**
 * Path helpers + mode sanitization for workspace snapshots (split of
 * workspaceSnapshotStore.js for the quality gate).
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { normalizeRelativePath } = require('./pathSafety');

const IGNORED_DIRECTORIES = new Set(['.git', '.genos', 'node_modules', 'target', 'dist', 'coverage', '.next', '.aws', '.ssh', '.docker', '.kube', '.gnupg']);
const IGNORED_FILES = new Set(['genos.db', 'genos.db-shm', 'genos.db-wal']);
const SENSITIVE_FILES = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_rsa(?:\..*)?|known_hosts(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?|vault(?:\..*)?)$/i;

function snapshotRoot(workspacePath, workspaceId) {
  const configured = process.env.GENOS_SNAPSHOT_ROOT;
  return configured
    ? path.resolve(configured, String(workspaceId || 'workspace'))
    : path.resolve(workspacePath, '.genos', 'workspace-snapshots');
}

function isSafeRelative(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\0')) return false;
  if (path.isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath)) return false;
  const segments = relativePath.split(/[\\/]/);
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

// Joins a manifest-provided relative path onto a base directory and refuses
// anything that resolves outside it, even via embedded traversal sequences.
function containedJoin(base, relativePath) {
  const root = path.resolve(base);
  const resolved = path.resolve(root, String(relativePath));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Snapshot path escapes its target directory: ${relativePath}`);
  }
  return resolved;
}

async function assertNoSymlinkPath(root, relativePath) {
  const normalized = normalizeRelativePath(relativePath, 'snapshot path');
  const realRoot = await fsp.realpath(root);
  let current = realRoot;
  for (const segment of normalized.split('/')) {
    current = path.join(current, segment);
    try {
      if ((await fsp.lstat(current)).isSymbolicLink()) {
        throw new Error(`Snapshot path traverses a symbolic link: ${relativePath}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return path.join(realRoot, normalized);
}

function shouldIgnore(relativePath, entry) {
  const parts = relativePath.split(path.sep);
  return parts.some((part) => IGNORED_DIRECTORIES.has(part)) || IGNORED_FILES.has(entry.name) || entry.name.startsWith('genos.db') || SENSITIVE_FILES.test(entry.name);
}

async function exists(filePath) {
  try { await fsp.access(filePath); return true; } catch (_) { return false; }
}

// A manifest path is executable-eligible only under a `bin/` directory.
function isExecutablePath(relativePath) {
  return String(relativePath).split('/').includes('bin');
}

function hasShebangPrefix(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21;
}

async function readShebangPrefix(filePath) {
  let handle = null;
  try {
    handle = await fsp.open(filePath, 'r');
    const buffer = Buffer.alloc(2);
    const { bytesRead } = await handle.read(buffer, 0, 2, 0);
    return bytesRead === 2 && buffer[0] === 0x23 && buffer[1] === 0x21;
  } catch (_) {
    return false;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

// Strip setuid/setgid/sticky always; grant +x only to bin/ entries or
// shebang scripts — everything else materializes without execute bits.
function sanitizeFileMode(storedMode, relativePath, bytes) {
  const masked = Number.isSafeInteger(storedMode) ? storedMode & 0o777 : 0o644;
  if (isExecutablePath(relativePath) || hasShebangPrefix(bytes)) return masked;
  return masked & ~0o111;
}

module.exports = {
  snapshotRoot,
  isSafeRelative,
  containedJoin,
  assertNoSymlinkPath,
  shouldIgnore,
  exists,
  isExecutablePath,
  hasShebangPrefix,
  readShebangPrefix,
  sanitizeFileMode
};
