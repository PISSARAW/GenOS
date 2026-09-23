'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return (result.stdout || '').trim();
}

async function main() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-d15-'));
  const repoPath = path.join(base, 'sample-repo');
  fs.mkdirSync(repoPath);
  git(['init', '-b', 'main'], repoPath);
  git(['config', 'user.email', 'daemon@example.com'], repoPath);
  git(['config', 'user.name', 'GenOS Daemon Test'], repoPath);
  const target = path.join(repoPath, 'app.js');
  fs.writeFileSync(target, 'module.exports = 1;\n');
  git(['add', '-A'], repoPath);
  git(['commit', '-m', 'initial commit'], repoPath);

  delete require.cache[require.resolve('../src/services/daemonRepoWorkerService')];
  const worker = require('../src/services/daemonRepoWorkerService');
  const repo = { name: 'sample-repo', path: repoPath };
  const session = worker.ensureDaemonWorktree(repo);

  // 1. Le stub déprécié ne touche à rien sur disque.
  const before = fs.statSync(target).mtimeMs;
  const headBefore = git(['rev-parse', 'HEAD'], repoPath);
  const res = await worker.runAutofixCycle(repo, session);
  assert.equal(res.attempted, false);
  assert.ok(/deprecated/i.test(res.reason));
  assert.equal(fs.statSync(target).mtimeMs, before);
  assert.equal(git(['rev-parse', 'HEAD'], repoPath), headBefore);

  // 2. Le cycle complet ne commet plus rien : watching, zéro avance.
  const record = await worker.runRepoDaemonCycle(repo);
  assert.equal(record.lastFix.attempted, false);
  assert.ok(/deprecated/i.test(record.lastFix.reason));
  assert.equal(worker.commitsAheadOfBase(session), 0);

  // 3. L'autostart expose l'avis de dépréciation sans appeler de modèle.
  const autostart = require('../src/services/daemonAgentAutostart');
  assert.ok(/RepairEpisode/.test(worker.AUTOFIX_DEPRECATION_REASON));

  try { git(['worktree', 'remove', '--force', session.worktree], repoPath); } catch (_) {}
  fs.rmSync(base, { recursive: true, force: true });
  assert.ok(autostart.runProactiveCycle, 'autostart entrypoint intact');
  console.log('Daemon D15 tests passed (mtime gone, autofix deprecated no-op).');
}

main().catch((error) => { console.error(error); process.exit(1); });
