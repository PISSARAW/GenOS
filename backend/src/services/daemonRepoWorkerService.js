/**
 * Daemon Repo Worker Service
 *
 * Upgrades the GenOS Sentinel daemon from a passive "here is your git status"
 * reporter into an active maintainer:
 *  - keeps a persistent, isolated git worktree per repository checked out on a
 *    dedicated daemon branch that the daemon always has access to;
 *  - on every cycle (including after a daemon restart) resumes work on that
 *    same branch instead of starting over;
 *  - rebases the daemon branch onto the evolving state of the branch the
 *    human is actually working on before attempting anything, so it never
 *    drifts from "current";
 *  - uses GenOS's own model-routing stack (with budget/fallback) plus the
 *    dead-end/negative-knowledge memory primitives to find and safely apply
 *    one verified fix per cycle (patch applied + rolled back through the
 *    same sandboxed, allow-listed-test capsule worker used elsewhere in
 *    GenOS), then records the outcome back into GenOS's own memory so future
 *    cycles do not repeat known dead ends;
 *  - opens a merge request (via the `gh` CLI when available) once verified
 *    commits are ready, or falls back to pushing the branch for manual
 *    review when no PR tooling is configured.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const modelRouter = require('./modelRouter');
const localCodeWorker = require('./localCodeWorkerService');
const telemetry = require('./telemetryObserver');

const repoRoot = path.resolve(__dirname, '../../..');
const stateFile = path.join(repoRoot, '.genos', 'daemon_repo_state.json');
const DAEMON_BRANCH_PREFIX = 'genos-daemon';
const WORKTREE_ROOT_NAME = '.genos-daemon-worlds';
const AUTOFIX_DISABLED = /^(1|true)$/i.test(String(process.env.GENOS_DAEMON_DISABLE_AUTOFIX || ''));
const MR_DISABLED = /^(1|true)$/i.test(String(process.env.GENOS_DAEMON_DISABLE_PR || ''));

function loadState() {
  try {
    if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (_) {}
  return {};
}

function saveState(state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

function git(args, cwd, options = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: options.timeoutMs || 15000 });
  return { code: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

function currentBranch(repoPath) {
  const res = git(['branch', '--show-current'], repoPath);
  return res.stdout || null;
}

function daemonBranchName(repoName) {
  return `${DAEMON_BRANCH_PREFIX}/${String(repoName).replace(/[\\/]/g, '-')}`;
}

function worktreePath(repoPath) {
  return path.join(path.dirname(repoPath), WORKTREE_ROOT_NAME, path.basename(repoPath));
}

/** Ensure a persistent worktree checked out on the repo's dedicated daemon branch. */
function ensureDaemonWorktree(repo) {
  const base = currentBranch(repo.path);
  if (!base) return null; // detached HEAD or not a usable repo; skip safely
  const branch = daemonBranchName(repo.name);
  const wt = worktreePath(repo.path);

  const listRes = git(['worktree', 'list', '--porcelain'], repo.path);
  const alreadyLinked = listRes.code === 0 && listRes.stdout.includes(path.resolve(wt).replace(/\\/g, '/'));

  if (!alreadyLinked) {
    fs.mkdirSync(path.dirname(wt), { recursive: true });
    if (fs.existsSync(wt)) {
      // Stale directory left over from a previous crashed run; let git reclaim it.
      git(['worktree', 'prune'], repo.path);
    }
    const branchExists = git(['rev-parse', '--verify', branch], repo.path).code === 0;
    const addArgs = branchExists ? ['worktree', 'add', wt, branch] : ['worktree', 'add', '-b', branch, wt, base];
    const addRes = git(addArgs, repo.path);
    if (addRes.code !== 0) return null;
  }
  return { branch, base, worktree: wt };
}

/** Rebase the daemon branch onto the latest state of the branch the human is working on. */
function syncWithUpstream(session) {
  git(['fetch', '--all', '--prune'], session.worktree, { timeoutMs: 30000 });
  const hasRemoteBase = git(['rev-parse', '--verify', `origin/${session.base}`], session.worktree).code === 0;
  const baseRef = hasRemoteBase ? `origin/${session.base}` : session.base;
  const rebase = git(['rebase', baseRef], session.worktree, { timeoutMs: 60000 });
  if (rebase.code !== 0) {
    git(['rebase', '--abort'], session.worktree);
    return { synced: false, baseRef, reason: rebase.stderr || 'rebase conflict against the current branch' };
  }
  return { synced: true, baseRef };
}

function commitsAheadOfBase(session) {
  const res = git(['rev-list', '--count', `${session.base}..HEAD`], session.worktree);
  return res.code === 0 ? Number(res.stdout || '0') || 0 : 0;
}

function detectTestCommand(worktree) {
  if (fs.existsSync(path.join(worktree, 'package.json'))) return 'npm test';
  if (fs.existsSync(path.join(worktree, 'Cargo.toml'))) return 'cargo test';
  if (fs.existsSync(path.join(worktree, 'pyproject.toml')) || fs.existsSync(path.join(worktree, 'requirements.txt'))) return 'pytest';
  return null;
}

function listCandidateFiles(worktree) {
  const res = git(['ls-files'], worktree);
  if (res.code !== 0) return [];
  return res.stdout.split('\n').map((f) => f.trim()).filter(Boolean)
    .filter((rel) => localCodeWorker.safePath(rel))
    .filter((rel) => /\.(js|ts|tsx|jsx|py|rs|go|java|rb|cjs|mjs)$/i.test(rel));
}

function pickCandidateFile(worktree) {
  const files = listCandidateFiles(worktree);
  const withStats = files.map((rel) => {
    try {
      const stat = fs.statSync(path.join(worktree, rel));
      return { rel, mtime: stat.mtimeMs, size: stat.size };
    } catch (_) {
      return null;
    }
  }).filter((f) => f && f.size > 0 && f.size < 60000);
  withStats.sort((a, b) => b.mtime - a.mtime);
  return withStats[0] || null;
}

async function checkDeadEnd(taskKey) {
  try {
    const memoryDeadEnds = require('./primitiveHandlers/memoryDeadEnds');
    return await memoryDeadEnds.avoidKnownDeadEnds({ task: taskKey, agentId: 'daemon' });
  } catch (_) {
    return { isDeadEndRisk: false, warning: null };
  }
}

async function recordOutcome(taskKey, repoName, relPath, success, detail) {
  try {
    const vectorMemory = require('./vectorMemoryService');
    if (success) {
      await vectorMemory.storeMemory('daemon', `Fixed ${relPath} in ${repoName}: ${detail}`, null, {
        category: 'Experience',
        title: `Daemon fix: ${repoName}/${relPath}`
      });
    } else {
      await vectorMemory.storeMemory('daemon', `Attempted fix on ${taskKey} did not pan out: ${detail}`, null, {
        category: 'Failure',
        title: `Daemon dead end: ${taskKey}`
      });
    }
  } catch (_) {
    // Memory persistence is best-effort; never block the daemon cycle on it.
  }
}

/** Analyze one candidate file, propose a verified fix, apply it through the sandboxed capsule worker, and commit it. */
async function runAutofixCycle(repo, session) {
  if (AUTOFIX_DISABLED) return { attempted: false, reason: 'autofix disabled via GENOS_DAEMON_DISABLE_AUTOFIX' };

  const testCommand = detectTestCommand(session.worktree);
  if (!testCommand) return { attempted: false, reason: 'no allow-listed test command detected for this repository' };

  const candidate = pickCandidateFile(session.worktree);
  if (!candidate) return { attempted: false, reason: 'no eligible source file found' };

  const taskKey = `${repo.name}:${candidate.rel}`;
  const deadEnd = await checkDeadEnd(taskKey);
  const deadEndWarning = deadEnd.isDeadEndRisk
    ? `\n\nKNOWN DEAD END: ${deadEnd.warning || 'a previous attempt on this file did not work.'} Propose a materially different, more conservative fix or return an empty patch.`
    : '';

  const content = fs.readFileSync(path.join(session.worktree, candidate.rel), 'utf8');
  const prompt = [
    `You are the GenOS autonomous maintainer daemon for the repository "${repo.name}".`,
    `Review the file "${candidate.rel}" below for one concrete, narrowly-scoped bug or inconsistency you can fix with high confidence.`,
    'If you find a genuine fix, return exactly this JSON object and nothing else:',
    `{"format":"genos.file-replacement/v1","patches":[{"path":"${candidate.rel}","content":"<complete corrected file content>"}],"tests":["${testCommand}"],"evidence":"<what was wrong and why this fixes it>"}`,
    `If nothing needs fixing, return {"format":"genos.file-replacement/v1","patches":[],"tests":["${testCommand}"],"evidence":"no fix needed"}.`,
    'Never invent an issue; an empty patches array is a valid and expected outcome. Never touch tests, lockfiles, manifests, or secrets.' + deadEndWarning,
    '--- FILE CONTENT ---',
    content
  ].join('\n\n');

  let generated;
  try {
    generated = await modelRouter.generate({ db: null, agentId: `daemon:${repo.name}`, prompt, timeoutMs: 90000 });
  } catch (error) {
    await recordOutcome(taskKey, repo.name, candidate.rel, false, `model routing failed: ${error.message}`);
    return { attempted: true, applied: false, reason: `model routing failed: ${error.message}` };
  }

  let proposal;
  try {
    proposal = localCodeWorker.parseProposal(generated.text || '');
  } catch (error) {
    await recordOutcome(taskKey, repo.name, candidate.rel, false, `invalid proposal: ${error.message}`);
    return { attempted: true, applied: false, reason: `invalid proposal: ${error.message}` };
  }

  if (!proposal.patches.length) {
    return { attempted: true, applied: false, file: candidate.rel, reason: proposal.evidence || 'no fix needed' };
  }

  let result;
  try {
    result = await localCodeWorker.executeProposal({ workspaceRoot: session.worktree, text: generated.text });
  } catch (error) {
    await recordOutcome(taskKey, repo.name, candidate.rel, false, `patch execution failed: ${error.message}`);
    return { attempted: true, applied: false, file: candidate.rel, reason: `patch execution failed: ${error.message}` };
  }

  if (result.testStatus !== 'passed') {
    await recordOutcome(taskKey, repo.name, candidate.rel, false, `tests failed after patch, rolled back: ${JSON.stringify(result.tests)}`);
    return { attempted: true, applied: false, file: candidate.rel, reason: 'tests failed after patch; rolled back', tests: result.tests };
  }

  const commitMessage = `[GenOS Daemon] ${proposal.evidence || 'Automated fix'}`.slice(0, 240);
  git(['add', '-A'], session.worktree);
  const commitRes = git(['commit', '-m', commitMessage], session.worktree);
  const applied = commitRes.code === 0;
  await recordOutcome(taskKey, repo.name, candidate.rel, applied, proposal.evidence || 'automated fix');
  return { attempted: true, applied, file: candidate.rel, evidence: proposal.evidence, tests: result.tests };
}

function pushBranch(session) {
  return git(['push', '-u', 'origin', session.branch], session.worktree, { timeoutMs: 30000 });
}

function detectGithubSlug(repoPath) {
  const res = git(['remote', 'get-url', 'origin'], repoPath);
  const match = res.stdout.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/i);
  return match ? match[1] : null;
}

function ghCliAvailable() {
  const res = spawnSync('gh', ['--version'], { encoding: 'utf8', timeout: 5000 });
  return res.status === 0;
}

/** Push the daemon branch and, when possible, open a merge request for verified commits. */
function openMergeRequest(repo, session) {
  if (MR_DISABLED) return { opened: false, reason: 'merge requests disabled via GENOS_DAEMON_DISABLE_PR' };

  const pushRes = pushBranch(session);
  if (pushRes.code !== 0) return { opened: false, reason: pushRes.stderr || 'push failed' };

  const slug = detectGithubSlug(repo.path);
  if (slug && ghCliAvailable()) {
    const pr = spawnSync('gh', [
      'pr', 'create', '--repo', slug, '--head', session.branch, '--base', session.base,
      '--title', `[GenOS Daemon] Automated fixes on ${session.branch}`,
      '--body', 'Autonomous GenOS daemon fixes. Every commit was verified by this repository\'s own test suite before being applied.'
    ], { cwd: session.worktree, encoding: 'utf8', timeout: 20000 });
    if (pr.status === 0) return { opened: true, pushed: true, url: (pr.stdout || '').trim() };
    // A PR may already be open for this branch; that's not a failure worth reporting loudly.
    if (/already exists/i.test(pr.stderr || '')) return { opened: true, pushed: true, reason: 'pull request already open' };
    return { opened: false, pushed: true, reason: pr.stderr || 'gh pr create failed' };
  }
  return { opened: false, pushed: true, reason: slug ? 'gh CLI unavailable' : 'origin remote is not a GitHub repository' };
}

/** Run one full daemon-maintenance cycle for a single repository: sync, fix, and (if ready) open a merge request. */
async function runRepoDaemonCycle(repo) {
  const state = loadState();
  const key = path.resolve(repo.path);
  let record = state[key] || { history: [] };

  const session = ensureDaemonWorktree(repo);
  if (!session) {
    record = { ...record, status: 'skipped', reason: 'not a usable git repository (detached HEAD or no branch)', updatedAt: new Date().toISOString() };
    state[key] = record;
    saveState(state);
    return record;
  }

  const sync = syncWithUpstream(session);
  const fix = sync.synced ? await runAutofixCycle(repo, session) : { attempted: false, reason: `sync failed: ${sync.reason}` };
  const ahead = sync.synced ? commitsAheadOfBase(session) : (record.commitsAheadOfBase || 0);

  let mergeRequest = record.mergeRequest || null;
  if (sync.synced && ahead > 0 && (!mergeRequest || mergeRequest.commitCount !== ahead)) {
    const mr = openMergeRequest(repo, session);
    mergeRequest = { ...mr, commitCount: ahead, updatedAt: new Date().toISOString() };
  }

  record = {
    branch: session.branch,
    base: session.base,
    worktree: session.worktree,
    status: !sync.synced ? 'sync_conflict' : (fix.applied ? 'fix_committed' : 'watching'),
    lastSync: sync,
    lastFix: fix,
    commitsAheadOfBase: ahead,
    mergeRequest,
    updatedAt: new Date().toISOString(),
    history: [
      ...(record.history || []).slice(-19),
      { at: new Date().toISOString(), synced: sync.synced, fix: fix.attempted ? (fix.applied ? 'applied' : 'skipped') : 'no-op' }
    ]
  };

  telemetry.emitEvent({
    eventType: fix.applied ? 'DAEMON_REPO_FIX_COMMITTED' : 'DAEMON_REPO_CYCLE',
    agentId: `daemon:${repo.name}`,
    action: 'AUTONOMOUS_MAINTENANCE',
    detail: fix.applied ? `Committed a verified fix on ${session.branch}: ${fix.evidence}` : (fix.reason || sync.reason || 'cycle completed'),
    severity: sync.synced ? 'info' : 'warning',
    payload: { repo: repo.name, branch: session.branch, base: session.base, commitsAheadOfBase: ahead, mergeRequest }
  });

  state[key] = record;
  saveState(state);
  return record;
}

async function runFleetDaemonCycle(repos) {
  const results = [];
  for (const repo of repos) {
    try {
      results.push({ repo: repo.name, ...(await runRepoDaemonCycle(repo)) });
    } catch (error) {
      results.push({ repo: repo.name, status: 'error', reason: error.message });
    }
  }
  return results;
}

module.exports = {
  daemonBranchName,
  worktreePath,
  ensureDaemonWorktree,
  syncWithUpstream,
  commitsAheadOfBase,
  detectTestCommand,
  pickCandidateFile,
  runAutofixCycle,
  openMergeRequest,
  runRepoDaemonCycle,
  runFleetDaemonCycle,
  loadState
};
