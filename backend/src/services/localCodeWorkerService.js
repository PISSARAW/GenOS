const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const snapshotStore = require('./workspaceSnapshotStore');

const FORBIDDEN_PARTS = new Set(['.git', '.genos', 'node_modules', 'target', 'dist', 'coverage', 'tests', 'test']);
const FORBIDDEN_NAMES = /(^|\/)(Cargo\.toml|Cargo\.lock|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.env[^/]*|.*\.config\.[^/]+|.*(?:^|[._-])(test|spec)(?:[._-]|$).*|.*secret.*|.*credential.*)$/i;
function safePath(relative) {
  return typeof relative === 'string' && relative.length > 0 && relative.length < 240 && !path.isAbsolute(relative) && !relative.split(/[\\/]/).some((part) => !part || part === '.' || part === '..' || FORBIDDEN_PARTS.has(part.toLowerCase())) && !FORBIDDEN_NAMES.test(relative);
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
  const normalized = String(command || '').trim();
  if (!normalized) return false;
  if (normalized === 'cargo test --quiet') return require('fs').existsSync(path.join(root, 'Cargo.toml'));
  if (normalized === 'npm test -- --runInBand') return require('fs').existsSync(path.join(root, 'package.json'));
  return false;
}
async function runTest(command, root) {
  const [program, ...args] = command.split(' ');
  return new Promise((resolve) => {
    const child = spawn(program, args, { cwd: root, shell: false, env: { PATH: process.env.PATH || '/usr/bin:/bin', CI: '1', GENOS_ISOLATED_RUNNER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(0, 20000); }); child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(0, 20000); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ command, exitCode: code, signal, stdout, stderr }); });
    child.on('error', (error) => { clearTimeout(timer); resolve({ command, exitCode: -1, stderr: error.message }); });
  });
}
async function executeProposal({ workspaceRoot, text }) {
  const proposal = parseProposal(text);
  const before = new Map((await snapshotStore.collectFiles(workspaceRoot)).map((file) => [file.path, file.hash]));
  for (const patch of proposal.patches) {
    const destination = path.resolve(workspaceRoot, patch.path);
    if (!destination.startsWith(`${path.resolve(workspaceRoot)}${path.sep}`)) throw new Error('Patch escaped its isolated capsule.');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, patch.content, 'utf8');
  }
  const tests = [];
  for (const command of proposal.tests) {
    if (!allowedTest(command, workspaceRoot)) throw new Error(`Test command is not allow-listed: ${command}`);
    tests.push(await runTest(command, workspaceRoot));
  }
  const after = await snapshotStore.collectFiles(workspaceRoot);
  const changedFiles = after.filter((file) => before.get(file.path) !== file.hash).map((file) => file.path);
  return { proposal: { format: proposal.format, patches: proposal.patches.map(({ path }) => ({ path })), evidence: proposal.evidence }, changedFiles, tests, merged: false };
}
module.exports = { safePath, parseProposal, executeProposal };
