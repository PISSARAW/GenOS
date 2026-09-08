const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { getDatabase } = require('../db');
const { terminateChild } = require('./processTermination');

const MAX_OUTPUT = 16000;
const TEST_TIMEOUT_MS = 120000;

function run(command, args, cwd, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const startedAt = Date.now();
    const timer = setTimeout(() => terminateChild(child), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-MAX_OUTPUT); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-MAX_OUTPUT); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ command: [command, ...args].join(' '), exitCode, signal, durationMs: Date.now() - startedAt, stdout, stderr });
    });
  });
}

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function packageScripts(packagePath) {
  try {
    const { readFileCached } = require('./vfsCache');
    const manifest = JSON.parse(await readFileCached(packagePath, 'utf8'));
    return manifest.scripts || {};
  } catch {
    return {};
  }
}

async function getWorkspace(workspaceId) {
  const db = await getDatabase();
  const workspace = await db.get('SELECT id, name, path FROM workspaces WHERE id = ?', workspaceId);
  if (!workspace) {
    const error = new Error('Workspace not found.');
    error.statusCode = 404;
    throw error;
  }
  return workspace;
}

async function discoverCommands(workspacePath) {
  const commands = [];
  const roots = [''];
  const entries = await fs.readdir(workspacePath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !['node_modules', '.git', 'target'].includes(entry.name)) roots.push(entry.name);
  }
  for (const root of roots) {
    const commandPath = path.join(workspacePath, root);
    const suffix = root ? ` (${root})` : '';
    const idSuffix = root ? `-${root}` : '';
    const scripts = await packageScripts(path.join(commandPath, 'package.json'));
    if (scripts.test) {
      commands.push({ id: `npm-test${idSuffix}`, label: `npm test${suffix}`, executable: 'npm', args: ['test'], cwd: root });
    }
    if (scripts.check) {
      commands.push({ id: `npm-check${idSuffix}`, label: `npm run check${suffix}`, executable: 'npm', args: ['run', 'check'], cwd: root });
    }
    if (await exists(path.join(commandPath, 'pytest.ini')) || await exists(path.join(commandPath, 'pyproject.toml'))) {
      commands.push({ id: `pytest${idSuffix}`, label: `pytest${suffix}`, executable: 'pytest', args: [], cwd: root });
    }
    if (await exists(path.join(commandPath, 'Cargo.toml'))) {
      commands.push({ id: `cargo-test${idSuffix}`, label: `cargo test${suffix}`, executable: 'cargo', args: ['test'], cwd: root });
    }
  }
  return commands;
}

async function inspectWorkspace(workspaceId) {
  const workspace = await getWorkspace(workspaceId);
  const entries = await fs.readdir(workspace.path, { withFileTypes: true });
  const files = entries
    .filter((entry) => !['node_modules', '.git', 'target'].includes(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 80)
    .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' }));
  const [commands, git] = await Promise.all([
    discoverCommands(workspace.path),
    run('git', ['status', '--short'], workspace.path).catch(() => null)
  ]);
  return {
    workspace: { id: workspace.id, name: workspace.name, path: workspace.path },
    files,
    testCommands: commands.map(({ id, label }) => ({ id, label })),
    git: git ? { available: true, changedFiles: git.stdout.split('\n').filter(Boolean), error: git.stderr.trim() || null } : { available: false, changedFiles: [], error: null }
  };
}

async function runWorkspaceTest(workspaceId, commandId) {
  const workspace = await getWorkspace(workspaceId);
  const command = (await discoverCommands(workspace.path)).find((item) => item.id === commandId);
  if (!command) {
    const error = new Error('The selected test command is not available for this workspace.');
    error.statusCode = 400;
    throw error;
  }
  const result = await run(command.executable, command.args, path.join(workspace.path, command.cwd || ''), TEST_TIMEOUT_MS);
  return { workspace: { id: workspace.id, name: workspace.name }, command: { id: command.id, label: command.label }, ...result };
}

module.exports = { inspectWorkspace, runWorkspaceTest };
