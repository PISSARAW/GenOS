const fs = require('fs/promises');
const path = require('path');
const { walk } = require('../../utils/fs');
const {
  MAX_COPY_DEPTH, MAX_COPY_ENTRIES, SENSITIVE_COPY_FILES, addCopyBytes, isSensitivePath, maxCopyBytes
} = require('./constants');

async function availableBytes(directory) {
  try {
    const stats = await fs.statfs(directory);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch (error) {
    if (!['ENOSYS', 'ENOTSUP', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    return Number.POSITIVE_INFINITY;
  }
}

// Belt-and-braces scrub run after a copy. The walker only accepts two
// arguments, so this remains a best-effort pass; primary exclusion happens in
// copyTree()/copyUntrackedFiles() via isSensitivePath().
async function removeSensitiveFiles(root) {
  await walk(root, '', async (entry, childRelative, childPath) => {
    if (isSensitivePath(childRelative)) {
      await fs.rm(childPath, { recursive: true, force: true });
      return 'skip';
    }
    return undefined;
  });
}

function createExclusionFilter() {
  const excluded = new Set([
    '.git', '.genos', '.genos-agent-worlds', '.codex-worktrees', 'artifacts', 'node_modules', 'target'
  ]);
  return (name) => {
    return excluded.has(name) || SENSITIVE_COPY_FILES.test(name)
      || isDatabaseArtifact(name) || isAgentRunWorkspace(name);
  };
}

function isDatabaseArtifact(name) {
  return /\.(?:db|sqlite|sqlite3)(?:-(?:shm|wal|journal))?$/i.test(name)
    || /^genos\.db\.backup-/i.test(name);
}

function isAgentRunWorkspace(name) {
  return /^worker_.*_run_\d+$/i.test(name);
}

async function estimateCopyBytes(source) {
  const state = { bytes: 0, limit: maxCopyBytes(), entries: 0 };
  await measureCopyNode({ source, relative: '', state, isExcluded: createExclusionFilter() });
  return state.bytes;
}

async function measureCopyNode({ source, relative, state, isExcluded }) {
  const baseName = path.basename(source);
  if (isExcluded(baseName) || isSensitivePath(relative || baseName)) return;
  const sourceStat = await readCopyStat(source);
  if (!sourceStat) return;
  if (sourceStat.isSymbolicLink()) return;
  if (sourceStat.isFile()) {
    addCopyBytes(state, sourceStat.size);
    return;
  }
  if (!sourceStat.isDirectory()) return;
  await measureCopyDirectory({ source, relative, state, isExcluded });
}

async function readCopyStat(source) {
  try {
    return await fs.lstat(source);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function measureCopyDirectory({ source, relative, state, isExcluded }) {
  const depth = relative ? relative.split(path.sep).length : 0;
  if (depth > MAX_COPY_DEPTH) throw new Error(`Workspace copy exceeds the ${MAX_COPY_DEPTH}-level depth limit.`);
  for (const entry of await fs.readdir(source)) {
    if (isExcluded(entry)) continue;
    state.entries += 1;
    if (state.entries > MAX_COPY_ENTRIES) throw new Error(`Workspace copy exceeds the ${MAX_COPY_ENTRIES}-entry limit.`);
    await measureCopyNode({ source: path.join(source, entry), relative: relative ? path.join(relative, entry) : entry, state, isExcluded });
  }
}

async function copyTree(ctx, node) {
  const baseName = path.basename(node.source);
  if (ctx.isExcluded(baseName) || isSensitivePath(node.relative || baseName)) return;
  let sourceStat;
  try {
    sourceStat = await fs.lstat(node.source);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (sourceStat.isSymbolicLink()) return;
  if (sourceStat.isDirectory()) {
    await copyDirectory(ctx, node);
    return;
  }
  if (!sourceStat.isFile()) return;
  addCopyBytes(ctx.state, sourceStat.size);
  await fs.mkdir(path.dirname(node.destination), { recursive: true });
  await fs.copyFile(node.source, node.destination);
}

async function copyDirectory(ctx, node) {
  const depth = node.relative ? node.relative.split(path.sep).length : 0;
  if (depth > MAX_COPY_DEPTH) throw new Error(`Workspace copy exceeds the ${MAX_COPY_DEPTH}-level depth limit.`);
  await fs.mkdir(node.destination, { recursive: true });
  for (const entry of await fs.readdir(node.source)) {
    if (ctx.isExcluded(entry)) continue;
    ctx.state.entries += 1;
    if (ctx.state.entries > MAX_COPY_ENTRIES) throw new Error(`Workspace copy exceeds the ${MAX_COPY_ENTRIES}-entry limit.`);
    const childRelative = node.relative ? path.join(node.relative, entry) : entry;
    await copyTree(ctx, {
      source: path.join(node.source, entry),
      destination: path.join(node.destination, entry),
      relative: childRelative
    });
  }
}

module.exports = { availableBytes, estimateCopyBytes, removeSensitiveFiles, createExclusionFilter, copyTree };
