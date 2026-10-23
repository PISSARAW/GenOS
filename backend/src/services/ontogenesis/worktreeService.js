'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { resolveWorkspaceRoot, resolveContainedPathNoSymlinkSync } = require('../pathSafety');
const { runCommand } = require('../agentWorkspaceLifecycle/git');
const { pathAllowed, assertContainedFiles } = require('./pathAuthority');
const { FORBIDDEN } = require('./integrationService');
const { sourceFile } = require('./proofService');

function managedRoot(project) {
  const root = resolveWorkspaceRoot(project.root_path);
  const id = createHash('sha256').update(project.id).digest('hex').slice(0, 24);
  return resolveContainedPathNoSymlinkSync(root, `.genos/ontogenesis/${id}`);
}

async function ensureIntegration(project) {
  const root = managedRoot(project);
  const worktree = path.join(root, 'integration');
  await runCommand('git', ['check-ref-format', '--branch', project.branch], { cwd: project.root_path });
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(worktree)) await addIntegration(project, worktree);
  const result = await runCommand('git', ['branch', '--show-current'], { cwd: worktree });
  if (result.stdout.trim() !== project.branch) throw new Error('branche-integration-inattendue');
  const status = await runCommand('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: worktree });
  assertCleanIntegration(status.stdout);
  const head = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: worktree });
  return { worktree, baseSha: head.stdout.trim() };
}

function assertCleanIntegration(status) {
  const entries = String(status || '').split('\0').filter(Boolean);
  const unexpected = entries.filter((entry) => !isSealedTrinitySnapshot(entry)
    && !isGeneratedWorkspaceSnapshot(entry) && !isGeneratedTrajectory(entry) && entry !== '?? .genos-epoch');
  if (unexpected.length) throw new Error('worktree-integration-sale');
}

function isSealedTrinitySnapshot(entry) {
  if (!entry.startsWith('?? ')) return false;
  const relative = entry.slice(3).replace(/\\/g, '/');
  const parts = relative.split('/');
  return /^\.genos-agent-worlds\/trinity-snapshots\/[a-f0-9]{32}\/.+$/i.test(relative)
    && !parts.some((part) => part === '.' || part === '..');
}

function isGeneratedWorkspaceSnapshot(entry) {
  if (!entry.startsWith('?? ')) return false;
  const relative = entry.slice(3).replace(/\\/g, '/');
  const match = relative.match(/^\.genos\/workspace-snapshots\/([a-f0-9]{64})\/(.+)$/i);
  if (!match) return false;
  const parts = match[2].split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return false;
  return (parts.length === 1 && parts[0] === 'manifest.json')
    || (parts.length >= 2 && parts[0] === 'files');
}

function isGeneratedTrajectory(entry) {
  if (!entry.startsWith('?? ')) return false;
  const relative = entry.slice(3).replace(/\\/g, '/');
  return /^\.genos\/trajectories\/onto_run_[a-f0-9-]{36}\.json$/i.test(relative);
}

async function addIntegration(project, worktree) {
  let exists = true;
  try { await runCommand('git', ['show-ref', '--verify', `refs/heads/${project.branch}`], { cwd: project.root_path }); }
  catch (_) { exists = false; }
  const args = exists ? ['worktree', 'add', worktree, project.branch] : ['worktree', 'add', '-b', project.branch, worktree, 'HEAD'];
  await runCommand('git', args, { cwd: project.root_path });
}

function assertCandidate(project, worktree) {
  const root = managedRoot(project);
  const relative = path.relative(root, worktree).replace(/\\/g, '/');
  if (!relative.startsWith('capsules/')) throw new Error('capsule-hors-perimetre');
  return resolveContainedPathNoSymlinkSync(root, relative);
}

function sourceFileMap(root) {
  const files = new Map();
  const visit = (directory, relative = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const normalized = childRelative.replace(/\\/g, '/');
      if (!sourceFile(normalized)) continue;
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) visit(absolute, childRelative);
      else if (stat.isSymbolicLink()) files.set(normalized, `symlink:${fs.readlinkSync(absolute)}`);
      else if (stat.isFile()) files.set(normalized,
        require('crypto').createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'));
    }
  };
  visit(root);
  return files;
}

async function changedFiles(worktree, baseSha, baselineWorkspace = null) {
  if (baselineWorkspace) {
    const before = sourceFileMap(baselineWorkspace);
    const after = sourceFileMap(worktree);
    return [...new Set([...before.keys(), ...after.keys()])]
      .filter((file) => before.get(file) !== after.get(file)).sort();
  }
  const tracked = await runCommand('git', ['diff', '--name-only', '-z', baseSha], { cwd: worktree });
  const untracked = await runCommand('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: worktree });
  const extra = untracked.stdout.split('\0').filter(sourceFile).join('\0');
  return [...new Set((tracked.stdout + extra).split('\0').filter(Boolean))];
}

function checkFiles(files, authority) {
  for (const file of files) {
    if (!pathAllowed(authority, file)) throw new Error(`chemin-hors-perimetre:${file}`);
    if (FORBIDDEN.some((pattern) => pattern.test(file))) throw new Error(`fichier-interdit:${file}`);
  }
}

async function copyCandidate(input) {
  checkFiles(input.files, input.authority);
  for (const file of input.files) {
    const [source] = assertContainedFiles(input.candidate, [file]);
    const [destination] = assertContainedFiles(input.integration, [file]);
    if (!fs.existsSync(source)) { fs.rmSync(destination, { force: true }); continue; }
    if (!fs.statSync(source).isFile()) throw new Error('candidat-fichier-regulier-requis');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

module.exports = { managedRoot, ensureIntegration, assertCleanIntegration, isSealedTrinitySnapshot,
  isGeneratedWorkspaceSnapshot, isGeneratedTrajectory, assertCandidate, changedFiles, checkFiles, copyCandidate };
