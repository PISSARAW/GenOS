const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const snapshotStore = require('./workspaceSnapshotStore');
const { terminateChild } = require('./processTermination');
const { isAllowedSandboxTestCommand, normalizeSandboxCommand } = require('./sandboxCommandPolicy');
const { normalizeRelativePath } = require('./pathSafety');

const FORBIDDEN_PARTS = new Set(['.git', '.genos', 'node_modules', 'target', 'dist', 'coverage', 'tests', 'test']);
const FORBIDDEN_NAMES = /(^|\/)(Cargo\.toml|Cargo\.lock|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.env[^/]*|.*\.config\.[^/]+|.*(?:^|[._-])(test|spec)(?:[._-]|$).*|.*secret.*|.*credential.*)$/i;
function safePath(relative) {
  if (typeof relative !== 'string' || relative.length >= 240 || FORBIDDEN_NAMES.test(relative)) return false;
  try {
    const normalized = normalizeRelativePath(relative, 'patch path');
    return !normalized.split('/').some((part) => FORBIDDEN_PARTS.has(part.toLowerCase()));
  } catch (_) {
    return false;
  }
}
function parseProposal(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Local worker did not return a JSON patch proposal.');
  const proposal = JSON.parse(match[0]);
  if (!proposal || Object.keys(proposal).some((key) => !['format', 'patches', 'tests', 'evidence'].includes(key)) || proposal.format !== 'genos.file-replacement/v1' || !Array.isArray(proposal.patches) || !Array.isArray(proposal.tests) || typeof proposal.evidence !== 'string') throw new Error('Patch proposal violates the strict schema.');
  if (proposal.patches.length > 12 || proposal.tests.length < 1 || proposal.tests.length > 2) throw new Error('Patch proposal must contain one or two capsule tests.');
  for (const patch of proposal.patches) {
    if (!patch || Object.keys(patch).some((key) => !['path', 'content'].includes(key)) || !safePath(patch.path) || typeof patch.content !== 'string' || Buffer.byteLength(patch.content) > 200000) throw new Error(`Unsafe patch proposal for '${patch?.path || '<unknown>'}'.`);
  }
  return proposal;
}
function allowedTest(command, root) {
  return isAllowedSandboxTestCommand(command);
}
async function assertNoSymlinkPath(root, destination) {
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, destination);
  let current = resolvedRoot;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Patch path crosses a symlink: ${part}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
async function capturePatchState(workspaceRoot, patches) {
  const state = new Map();
  for (const patch of patches) {
    const normalized = normalizeRelativePath(patch.path, 'patch path');
    if (state.has(normalized)) throw new Error(`Duplicate patch path: ${normalized}`);
    const destination = path.resolve(workspaceRoot, normalized);
    try {
      const stat = await fs.lstat(destination);
      if (!stat.isFile()) throw new Error(`Patch target is not a regular file: ${normalized}`);
      state.set(normalized, { exists: true, content: await fs.readFile(destination), mode: stat.mode & 0o777 });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state.set(normalized, { exists: false });
    }
  }
  return state;
}
async function restorePatchState(workspaceRoot, state) {
  for (const [relative, original] of state) {
    const destination = path.resolve(workspaceRoot, relative);
    if (!original.exists) {
      await fs.rm(destination, { force: true });
      continue;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, original.content);
    await fs.chmod(destination, original.mode).catch(() => {});
  }
}
async function runTest(command, root) {
  const [program, ...args] = normalizeSandboxCommand(command).split(' ');
  return new Promise((resolve) => {
    const child = spawn(program, args, {
      cwd: root,
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        CI: '1',
        GENOS_ISOLATED_RUNNER: '1',
        ...(process.platform === 'win32' ? {
          SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows',
          SystemDrive: process.env.SystemDrive || 'C:',
          PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
          ComSpec: process.env.ComSpec || 'cmd.exe',
          TEMP: os.tmpdir(),
          TMP: os.tmpdir()
        } : {
          TMPDIR: os.tmpdir()
        })
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = ''; let stderr = ''; const timer = setTimeout(() => terminateChild(child), 120000);
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(0, 20000); }); child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(0, 20000); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ command, exitCode: code, signal, stdout, stderr }); });
    child.on('error', (error) => { clearTimeout(timer); resolve({ command, exitCode: -1, stderr: error.message }); });
  });
}
async function executeProposal({ workspaceRoot, text }) {
  const proposal = parseProposal(text);
  for (const command of proposal.tests) {
    if (!allowedTest(command, workspaceRoot)) throw new Error(`Test command is not allow-listed: ${command}`);
  }
  const before = new Map((await snapshotStore.collectFiles(workspaceRoot)).map((file) => [file.path, file.hash]));
  const patchState = await capturePatchState(workspaceRoot, proposal.patches);
  let tests;
  try {
    for (const patch of proposal.patches) {
      const destination = path.resolve(workspaceRoot, normalizeRelativePath(patch.path, 'patch path'));
      if (!destination.startsWith(`${path.resolve(workspaceRoot)}${path.sep}`)) throw new Error('Patch escaped its isolated capsule.');
      await assertNoSymlinkPath(workspaceRoot, destination);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await assertNoSymlinkPath(workspaceRoot, destination);
      await fs.writeFile(destination, patch.content, 'utf8');
    }
    tests = [];
    for (const command of proposal.tests) tests.push(await runTest(command, workspaceRoot));
  } catch (error) {
    await restorePatchState(workspaceRoot, patchState).catch(() => {});
    throw error;
  }
  if (tests.some((test) => test.exitCode !== 0)) {
    await restorePatchState(workspaceRoot, patchState);
    return { proposal: { format: proposal.format, patches: proposal.patches.map(({ path }) => ({ path })), evidence: proposal.evidence }, changedFiles: [], tests, merged: false, rolledBack: true, testStatus: 'failed' };
  }
  const after = await snapshotStore.collectFiles(workspaceRoot);
  const changedFiles = after.filter((file) => before.get(file.path) !== file.hash).map((file) => file.path);
  return { proposal: { format: proposal.format, patches: proposal.patches.map(({ path }) => ({ path })), evidence: proposal.evidence }, changedFiles, tests, merged: false, testStatus: 'passed' };
}
module.exports = { safePath, parseProposal, executeProposal, assertNoSymlinkPath, capturePatchState, restorePatchState };
