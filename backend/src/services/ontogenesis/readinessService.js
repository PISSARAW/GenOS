'use strict';

const path = require('path');
const fs = require('fs');
const { getProject } = require('./projectStore');
const { validateProjectConfig } = require('./configSchema');
const { validateProjectRoot } = require('./projectRootValidation');
const { runCommand } = require('../agentWorkspaceLifecycle/git');
const { managedRoot } = require('./worktreeService');

function parseProjectConfig(project) {
  try {
    return JSON.parse(project.config_json || '{}');
  } catch (_) {
    throw new Error('configuration-projet-illisible');
  }
}

function validateConfig(project, rawConfig) {
  const checked = validateProjectConfig(rawConfig);
  if (!checked.ok) throw new Error(`configuration-invalide:${checked.errors.join(',')}`);
  if (checked.config.branch !== project.branch) throw new Error('branche-projet-configuration-incoherente');
  return checked.config;
}

async function validateDatabase(db) {
  const databases = await db.all('PRAGMA database_list');
  const main = databases.find((entry) => entry.name === 'main');
  if (!main?.file) throw new Error('runtime-base-persistante-requise');
  return path.resolve(main.file);
}

function worktreeEntries(output) {
  return String(output).split(/\r?\n\r?\n/).map((record) => {
    const lines = record.split(/\r?\n/);
    return { path: lines.find((line) => line.startsWith('worktree '))?.slice(8),
      branch: lines.find((line) => line.startsWith('branch '))?.slice(7) };
  }).filter((entry) => entry.path);
}

function samePath(left, right) {
  const first = path.resolve(left).replace(/[\\/]+$/, '');
  const second = path.resolve(right).replace(/[\\/]+$/, '');
  return process.platform === 'win32'
    ? first.toLowerCase() === second.toLowerCase() : first === second;
}

async function validateIntegrationBranch(project, rootPath) {
  try {
    await runCommand('git', ['rev-parse', '--verify', 'HEAD^{commit}'], { cwd: rootPath });
  } catch (_) {
    throw new Error('commit-initial-requis-pour-worktree-integration');
  }
  const expected = path.join(managedRoot(project), 'integration');
  const entries = worktreeEntries((await runCommand('git', ['worktree', 'list', '--porcelain'],
    { cwd: rootPath })).stdout);
  const branchRef = `refs/heads/${project.branch}`;
  if (entries.some((entry) => entry.branch === branchRef && !samePath(entry.path, expected))) {
    throw new Error('branche-integration-deja-extraite');
  }
  if (fs.existsSync(expected) && !entries.some((entry) => samePath(entry.path, expected))) {
    throw new Error('worktree-integration-invalide');
  }
}

async function dockerReadiness(config, rootPath, probe = defaultDockerProbe) {
  const checks = config.checks.filter((check) => check.sandbox?.runtime === 'docker');
  if (!checks.length) return 'not_required';
  const images = [...new Set(checks.map((check) => check.sandbox.image))];
  await probe(rootPath, images);
  return 'ready';
}

function defaultDockerProbe(rootPath, images) {
  return require('./dockerVerifierRunner').assertDockerReady(rootPath, images);
}

async function inspectProject(db, projectId, dependencies = {}) {
  const project = await getProject(db, projectId);
  if (!project) throw new Error('projet-introuvable');
  const config = validateConfig(project, parseProjectConfig(project));
  const rootPath = await validateProjectRoot({ root: project.root_path, branch: project.branch });
  await validateIntegrationBranch(project, rootPath);
  const databasePath = await validateDatabase(db);
  const docker = await dockerReadiness(config, rootPath, dependencies.dockerProbe || defaultDockerProbe);
  return {
    status: 'ready', projectId, rootPath, branch: project.branch, databasePath,
    checks: config.checks.length, executor: config.executor || 'codex',
    executorAvailability: 'unknown', docker
  };
}

async function assertProjectReady(db, projectId, dependencies) {
  return inspectProject(db, projectId, dependencies);
}

module.exports = { assertProjectReady, dockerReadiness, validateIntegrationBranch };
