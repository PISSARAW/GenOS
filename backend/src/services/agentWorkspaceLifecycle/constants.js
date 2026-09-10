/**
 * Shared configuration for disposable agent-capsule workspaces.
 *
 * Reclamation is delayed by GENOS_WORKTREE_GC_DELAY_MS (default 10 minutes)
 * so post-close consumers — evidence-aware merging, recovery dispatch, action
 * execution — can finish reading the capsule before it disappears. A configured
 * value of `0` is clamped up to MIN_GC_DELAY_MS so it cannot race live readers;
 * `-1` disables reclamation. Setting GENOS_DISABLE_WORKSPACE_GC=1 disables
 * reclamation outright and is the documented escape hatch for tuning.
 */
const DEFAULT_GC_DELAY_MS = 10 * 60 * 1000;
const MIN_GC_DELAY_MS = 5000;
const CLEANUP_RETRY_DELAY_MS = 30 * 1000;
const MAX_COPY_DEPTH = 32;
const MAX_COPY_ENTRIES = 100000;
const DEFAULT_MAX_COPY_BYTES = 1024 * 1024 * 1024;
const EPOCH_MARKER_FILENAME = '.genos-epoch';
const RUNTIME_DIR_NAME = '.genos-runtime';
const SENSITIVE_BASENAME = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_rsa(?:\..*)?|known_hosts(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?|vault(?:\..*)?)$/i;
const SENSITIVE_COPY_FILES = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|id_rsa(?:\..*)?|known_hosts(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?|vault(?:\..*)?)$/i;

function maxCopyBytes() {
  const configured = Number(process.env.GENOS_MAX_WORKSPACE_COPY_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_COPY_BYTES;
}

function addCopyBytes(state, bytes) {
  state.bytes += bytes;
  if (state.bytes > state.limit) {
    const error = new Error(`Workspace copy exceeds the ${state.limit}-byte size limit.`);
    error.code = 'WORKSPACE_COPY_SIZE_LIMIT';
    throw error;
  }
}

function isSensitivePath(relativePath) {
  return String(relativePath).split(/[\\/]/).some((part) => SENSITIVE_BASENAME.test(part));
}

function gcDelayMs() {
  if (process.env.GENOS_DISABLE_WORKSPACE_GC === '1') return -1;
  const configured = Number(process.env.GENOS_WORKTREE_GC_DELAY_MS);
  if (!Number.isFinite(configured)) return DEFAULT_GC_DELAY_MS;
  if (configured < 0) return configured;
  return Math.max(configured, MIN_GC_DELAY_MS);
}

module.exports = {
  DEFAULT_GC_DELAY_MS,
  MIN_GC_DELAY_MS,
  CLEANUP_RETRY_DELAY_MS,
  MAX_COPY_DEPTH,
  MAX_COPY_ENTRIES,
  DEFAULT_MAX_COPY_BYTES,
  EPOCH_MARKER_FILENAME,
  RUNTIME_DIR_NAME,
  SENSITIVE_BASENAME,
  SENSITIVE_COPY_FILES,
  maxCopyBytes,
  addCopyBytes,
  isSensitivePath,
  gcDelayMs
};
