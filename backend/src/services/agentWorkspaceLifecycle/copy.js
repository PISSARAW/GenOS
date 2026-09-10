const fs = require('fs/promises');
const path = require('path');
const { walk } = require('../../utils/fs');
const {
  MAX_COPY_DEPTH, MAX_COPY_ENTRIES, SENSITIVE_COPY_FILES, addCopyBytes, isSensitivePath
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
  const excluded = new Set(['.git', '.genos', '.genos-agent-worlds', 'node_modules', 'target']);
  return (name) => {
    return excluded.has(name) || SENSITIVE_COPY_FILES.test(name) || /\.(db-shm|db-wal|db-journal)$/i.test(name);
  };
}

async function copyTree(ctx, node) {
  const baseName = path.basename(node.source);
  if (ctx.isExcluded(baseName) || isSensitivePath(node.relative || baseName)) return;
  const sourceStat = await fs.lstat(node.source);
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

module.exports = { availableBytes, removeSensitiveFiles, createExclusionFilter, copyTree };
