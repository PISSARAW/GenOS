const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { normalizeRelativePath, resolveContainedPath } = require('../pathSafety');
const { runCommand, withGitRepoLock } = require('./git');
const { bestEffort, pathExists, samePath, isInside } = require('./support');
const { availableBytes, removeSensitiveFiles, createExclusionFilter, copyTree } = require('./copy');
const { maxCopyBytes, addCopyBytes, isSensitivePath } = require('./constants');
const { trackWorkspace } = require('./cleanup');

function assertWorkerId(workerId) {
  const normalized = normalizeRelativePath(String(workerId || ''), 'worker id');
  if (normalized.includes('/') || normalized.includes('\\')) throw new Error('worker id must be a single safe path segment.');
  return normalized;
}

function resolveOverrides(optionsOverride) {
  const isObject = typeof optionsOverride === 'object' && optionsOverride !== null;
  const capsuleRootOverride = typeof optionsOverride === 'string'
    ? optionsOverride
    : isObject ? optionsOverride.capsuleRoot : null;
  const useVfs = (isObject && optionsOverride.vfs === true) || process.env.GENOS_VFS_WORKSPACES === '1';
  return { capsuleRootOverride, useVfs };
}

function assertCapsuleBoundary(resolvedCapsuleRoot, source, defaultRoot) {
  const configuredRoot = process.env.GENOS_CAPSULE_ROOT ? path.resolve(process.env.GENOS_CAPSULE_ROOT) : null;
  const siblingRoot = path.resolve(path.dirname(source));
  if (samePath(resolvedCapsuleRoot, configuredRoot)) return;
  if (samePath(resolvedCapsuleRoot, siblingRoot)) return;
  if (isInside(resolvedCapsuleRoot, defaultRoot)) return;
  if (isInside(resolvedCapsuleRoot, configuredRoot)) return;
  throw new Error(`Capsule root '${resolvedCapsuleRoot}' is outside the source workspace boundary.`);
}

function resolveCapsuleRoot(source, capsuleRootOverride) {
  const defaultRoot = path.join(path.dirname(source), '.genos-agent-worlds');
  const capsuleRoot = capsuleRootOverride || process.env.GENOS_CAPSULE_ROOT || defaultRoot;
  if (!capsuleRootOverride) return capsuleRoot;
  assertCapsuleBoundary(path.resolve(capsuleRootOverride), source, defaultRoot);
  return capsuleRoot;
}

function resolveDestination(source, workerId, { capsuleRoot, capsuleRootOverride }) {
  if (capsuleRootOverride) return resolveContainedPath(capsuleRoot, workerId, 'capsule path');
  return resolveContainedPath(path.join(capsuleRoot, path.basename(source)), workerId, 'capsule path');
}

async function assertNoTrackedSymlinks(source) {
  try {
    await runCommand('git', ['rev-parse', '--is-inside-work-tree'], { cwd: source });
    const { stdout } = await runCommand('git', ['ls-files', '-s'], { cwd: source });
    const hasSymlink = stdout.split(/\r?\n/).some((entry) => entry.startsWith('120000 '));
    if (hasSymlink) throw new Error(`Git workspace '${source}' contains tracked symlinks and cannot be sandboxed safely.`);
  } catch (error) {
    if (/contains tracked symlinks/.test(error.message)) throw error;
  }
}

async function isGitWorkspace(source) {
  if (!fsSync.existsSync(path.join(source, '.git'))) return false;
  await assertNoTrackedSymlinks(source);
  return true;
}

async function provisionVfsWorkspace(source, destination, workerId) {
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, '.genos-vfs.json'), JSON.stringify({
    vfs: true,
    sourceWorkspace: source,
    workerId,
    createdAt: new Date().toISOString()
  }, null, 2));
  await trackWorkspace(workerId, destination);
  return destination;
}

async function assertGitTopLevelMatches(source) {
  const { stdout } = await runCommand('git', ['rev-parse', '--show-toplevel'], { cwd: source });
  if (!samePath(stdout.trim(), source)) {
    throw new Error(`Mission workspace ${source} is nested inside ${stdout.trim()}; copy only the mission scope.`);
  }
}

async function hasGitHead(source) {
  try {
    await runCommand('git', ['rev-parse', '--verify', 'HEAD'], { cwd: source });
    return true;
  } catch (_) {
    return false;
  }
}

async function gitDiff(source) {
  const { stdout } = await runCommand('git', ['diff', 'HEAD', '--binary'], { cwd: source });
  return stdout;
}

async function createGitWorktree(source, destination) {
  await withGitRepoLock(source, async () => {
    await runCommand('git', ['worktree', 'add', '--detach', destination, 'HEAD'], { cwd: source });
  });
}

async function applyGitDiff(destination, diff) {
  if (!diff || !diff.trim()) return;
  await runCommand('git', ['apply', '--whitespace=nowarn', '-'], { cwd: destination, input: diff });
}

async function copyUntrackedFiles(source, destination) {
  const { stdout } = await runCommand('git', ['ls-files', '--others', '--exclude-standard'], { cwd: source });
  const files = stdout.split(/\r?\n/).filter(Boolean).map((file) => normalizeRelativePath(file, 'untracked file'));
  const state = { bytes: 0, limit: maxCopyBytes() };
  for (const file of files) {
    if (isSensitivePath(file)) continue;
    const sourcePath = path.join(source, file);
    const destinationPath = path.join(destination, file);
    try {
      const sourceStat = await fs.lstat(sourcePath);
      if (sourceStat.isSymbolicLink()) continue;
      if (sourceStat.isFile()) addCopyBytes(state, sourceStat.size);
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.cp(sourcePath, destinationPath, { recursive: true });
    } catch (error) {
      if (error.code === 'WORKSPACE_COPY_SIZE_LIMIT') throw error;
    }
  }
}

async function rollbackWorktree(source, destination) {
  await bestEffort(withGitRepoLock(source, async () => {
    await runCommand('git', ['worktree', 'remove', '--force', destination], { cwd: source });
    await runCommand('git', ['worktree', 'prune'], { cwd: source });
  }));
  await bestEffort(fs.rm(destination, { recursive: true, force: true }));
}

async function copyWorkspace(source, destination, workerId) {
  if (await availableBytes(path.dirname(destination)) < 1024 * 1024 * 1024) {
    throw new Error('Insufficient disk space for a non-Git isolated workspace; free at least 1 GiB or use a Git workspace.');
  }
  const state = { bytes: 0, limit: maxCopyBytes(), entries: 0 };
  const ctx = { state, isExcluded: createExclusionFilter() };
  try {
    await copyTree(ctx, { source, destination, relative: '' });
    await removeSensitiveFiles(destination);
    await trackWorkspace(workerId, destination);
  } catch (error) {
    await bestEffort(fs.rm(destination, { recursive: true, force: true }));
    throw error;
  }
  return destination;
}

async function provisionGitWorkspace(source, destination, workerId) {
  try {
    await assertGitTopLevelMatches(source);
    if (!await hasGitHead(source)) {
      throw new Error(`Git repository at ${source} has no commits yet; cannot create detached worktree.`);
    }
    const diff = await gitDiff(source);
    await createGitWorktree(source, destination);
    await applyGitDiff(destination, diff);
    await copyUntrackedFiles(source, destination);
    await removeSensitiveFiles(destination);
    await trackWorkspace(workerId, destination);
    return destination;
  } catch (gitError) {
    await rollbackWorktree(source, destination);
    if (await pathExists(destination)) throw gitError;
    return copyWorkspace(source, destination, workerId);
  }
}

async function createIsolatedWorkspace(sourceRoot, workerId, optionsOverride) {
  const source = path.resolve(sourceRoot);
  const normalizedWorkerId = assertWorkerId(workerId);
  const { capsuleRootOverride, useVfs } = resolveOverrides(optionsOverride);
  const capsuleRoot = resolveCapsuleRoot(source, capsuleRootOverride);
  const destination = resolveDestination(source, normalizedWorkerId, { capsuleRoot, capsuleRootOverride });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (useVfs) return provisionVfsWorkspace(source, destination, normalizedWorkerId);
  if (await isGitWorkspace(source)) return provisionGitWorkspace(source, destination, normalizedWorkerId);
  return copyWorkspace(source, destination, normalizedWorkerId);
}

async function provisionMissionWorkspace(mission, executionMode) {
  if (executionMode !== 'orchestrator' || mission.workspaceProvisioned === true) return mission;
  const sourceWorkspace = mission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../../..');
  const workspaceRoot = await createIsolatedWorkspace(sourceWorkspace, mission.agentId);
  return { ...mission, workspaceRoot, capsuleRoot: path.dirname(workspaceRoot) };
}

module.exports = { createIsolatedWorkspace, provisionMissionWorkspace };
