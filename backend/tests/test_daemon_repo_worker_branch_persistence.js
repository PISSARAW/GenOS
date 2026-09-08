/**
 * Test suite for the daemon repo worker service: dedicated persistent daemon
 * branch (via an isolated git worktree), rebase-based sync with the branch
 * the human is actively using, and safe opt-out switches for autofix/PR
 * creation. Runs against a throwaway local git repo; makes no model-routing
 * or network calls.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return (result.stdout || '').trim();
}

async function runTests() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-daemon-repo-'));
  const repoPath = path.join(base, 'sample-repo');
  fs.mkdirSync(repoPath);

  git(['init', '-b', 'main'], repoPath);
  git(['config', 'user.email', 'daemon@example.com'], repoPath);
  git(['config', 'user.name', 'GenOS Daemon Test'], repoPath);
  fs.writeFileSync(path.join(repoPath, 'README.md'), 'hello world\n');
  git(['add', '-A'], repoPath);
  git(['commit', '-m', 'initial commit'], repoPath);

  delete require.cache[require.resolve('../src/services/daemonRepoWorkerService')];
  const daemonWorker = require('../src/services/daemonRepoWorkerService');

  const repo = { name: 'sample-repo', path: repoPath };

  console.log('=== TEST 1: Ensure daemon worktree/branch is created and reused ===');
  const session1 = daemonWorker.ensureDaemonWorktree(repo);
  assert.ok(session1, 'a session must be created for a normal branch-based repo');
  assert.equal(session1.branch, daemonWorker.daemonBranchName('sample-repo'));
  assert.ok(fs.existsSync(session1.worktree), 'the daemon worktree directory must exist');
  const branchInWorktree = git(['branch', '--show-current'], session1.worktree);
  assert.equal(branchInWorktree, session1.branch, 'the worktree must be checked out on the daemon branch');
  console.log(`  ✅ Daemon branch '${session1.branch}' created at ${session1.worktree}`);

  const session2 = daemonWorker.ensureDaemonWorktree(repo);
  assert.equal(session2.worktree, session1.worktree, 'a restart must resume the same worktree/branch instead of recreating it');
  console.log('  ✅ Restart resumes the same persistent worktree/branch (no re-creation).');

  console.log('\n=== TEST 2: Sync rebases the daemon branch onto the evolving current branch ===');
  fs.writeFileSync(path.join(repoPath, 'NEWS.md'), 'v2\n');
  git(['add', '-A'], repoPath);
  git(['commit', '-m', 'human progresses main'], repoPath);

  const sync = daemonWorker.syncWithUpstream(session1);
  assert.equal(sync.synced, true, 'sync must succeed when there is no conflicting history');
  assert.ok(fs.existsSync(path.join(session1.worktree, 'NEWS.md')), 'the daemon branch must pick up the latest commit from the current branch');
  const ahead = daemonWorker.commitsAheadOfBase(session1);
  assert.equal(ahead, 0, 'the daemon branch has no commits of its own yet');
  console.log('  ✅ Daemon branch rebased cleanly onto the latest state of the current branch.');

  console.log('\n=== TEST 3: Autofix respects its safety opt-out ===');
  process.env.GENOS_DAEMON_DISABLE_AUTOFIX = '1';
  delete require.cache[require.resolve('../src/services/daemonRepoWorkerService')];
  const daemonWorkerDisabled = require('../src/services/daemonRepoWorkerService');
  const fixResult = await daemonWorkerDisabled.runAutofixCycle(repo, session1);
  assert.equal(fixResult.attempted, false);
  assert.ok(/disabled/i.test(fixResult.reason), 'the disabled reason must be surfaced');
  delete process.env.GENOS_DAEMON_DISABLE_AUTOFIX;
  console.log('  ✅ GENOS_DAEMON_DISABLE_AUTOFIX correctly short-circuits the autofix cycle.');

  console.log('\n=== TEST 4: Merge request creation respects its safety opt-out ===');
  process.env.GENOS_DAEMON_DISABLE_PR = '1';
  delete require.cache[require.resolve('../src/services/daemonRepoWorkerService')];
  const daemonWorkerNoPr = require('../src/services/daemonRepoWorkerService');
  const mrResult = daemonWorkerNoPr.openMergeRequest(repo, session1);
  assert.equal(mrResult.opened, false);
  assert.ok(/disabled/i.test(mrResult.reason), 'the disabled reason must be surfaced');
  delete process.env.GENOS_DAEMON_DISABLE_PR;
  console.log('  ✅ GENOS_DAEMON_DISABLE_PR correctly short-circuits merge request creation.');

  console.log('\n=== TEST 5: detectTestCommand recognizes common project manifests ===');
  fs.writeFileSync(path.join(session1.worktree, 'package.json'), '{}');
  delete require.cache[require.resolve('../src/services/daemonRepoWorkerService')];
  const daemonWorkerFresh = require('../src/services/daemonRepoWorkerService');
  assert.equal(daemonWorkerFresh.detectTestCommand(session1.worktree), 'npm test');
  console.log('  ✅ detectTestCommand recognized package.json as an npm test project.');

  try { git(['worktree', 'remove', '--force', session1.worktree], repoPath); } catch (_) {}
  fs.rmSync(base, { recursive: true, force: true });

  console.log('\n=============================================================');
  console.log('TOUS LES TESTS DAEMON REPO WORKER ONT RÉUSSI !');
  console.log('=============================================================');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Échec des tests daemon repo worker:', err);
    process.exit(1);
  });
