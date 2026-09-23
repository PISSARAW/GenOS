/**
 * Daemon Repo Worker Service - maintains persistent git worktrees per repo,
 * rebases onto human branch, opens PRs via gh CLI.
 *
 * D15 (ADR 0034) : le choix de fichier au mtime (pickCandidateFile) est
 * SUPPRIMÉ — mtime n'est pas un signal causal — et le cycle d'autofix LLM
 * (runAutofixCycle) est DÉPRÉCIÉ en no-op permanent. La seule voie de
 * réparation est le RepairEpisode (daemon/repair) ouvert sur un finding
 * REPAIRABLE et exécuté par un worker en capsule isolée. Ce module ne
 * conserve que la maintenance de branches (sync + MR) ; il n'écrit plus
 * jamais de patch.
 */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const telemetry = require('./telemetryObserver');

const repoRoot = path.resolve(__dirname, '../../..');
const stateFile = path.join(repoRoot, '.genos', 'daemon_repo_state.json');
const lockFile = stateFile + '.lock';
const DAEMON_BRANCH_PREFIX = 'genos-daemon', WORKTREE_ROOT_NAME = '.genos-daemon-worlds';
const MR_DISABLED = /^(1|true)$/i.test(process.env.GENOS_DAEMON_DISABLE_PR || '');

const AUTOFIX_DEPRECATION_REASON = 'deprecated since D15: mtime autofix removed — open a RepairEpisode (daemon/repair) from a REPAIRABLE finding instead';

function acquireLock() {
  try { fs.writeFileSync(lockFile, process.pid.toString(), { flag: 'wx' }); return true; } catch { return false; }
}
function releaseLock() { try { fs.unlinkSync(lockFile); } catch {} }
function tryCleanupOrphanLock() { try { if (fs.existsSync(lockFile)) { const pid = Number(fs.readFileSync(lockFile, 'utf8')); if (!pid || !Number.isFinite(pid) || (process.platform !== 'win32' && pid !== process.pid && !process.kill(pid, 0))) { try { fs.unlinkSync(lockFile); } catch {} } } } catch {} }

function loadState() { try { tryCleanupOrphanLock(); } catch {} if (!acquireLock()) return {}; try { return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {}; } catch { return {}; } finally { releaseLock(); } }

function saveState(state) { if (!acquireLock()) return; try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); const tmp = stateFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8'); fs.renameSync(tmp, stateFile); } finally { releaseLock(); } }

function git(args, cwd, opt = {}) { const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: opt.timeoutMs || 15000 }); return { code: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() }; }
function currentBranch(repoPath) { return git(['branch', '--show-current'], repoPath).stdout || null; }
function daemonBranchName(name) { return `${DAEMON_BRANCH_PREFIX}/${String(name).replace(/[\\/]/g, '-')}`; }
function worktreePath(repoPath) { return path.join(path.dirname(repoPath), WORKTREE_ROOT_NAME, path.basename(repoPath)); }

function ensureDaemonWorktree(repo) {
  let base = currentBranch(repo.path);
  if (!base) { const h = git(['rev-parse', '--short', 'HEAD'], repo.path).stdout; base = `detached-${h || 'unknown'}`; git(['branch', '-f', base], repo.path); }
  const branch = daemonBranchName(repo.name), wt = worktreePath(repo.path);
  const list = git(['worktree', 'list', '--porcelain'], repo.path);
  if (!(list.code === 0 && list.stdout.includes(path.resolve(wt).replace(/\\/g, '/')))) {
    fs.mkdirSync(path.dirname(wt), { recursive: true }); if (fs.existsSync(wt)) git(['worktree', 'prune'], repo.path);
    const add = git(['rev-parse', '--verify', branch], repo.path).code === 0 ? ['worktree', 'add', wt, branch] : ['worktree', 'add', '-b', branch, wt, base];
    if (git(add, repo.path).code !== 0) return null;
  }
  return { branch, base, worktree: wt };
}

function fetchUpstream(wt) { return git(['fetch', '--all', '--prune'], wt, { timeoutMs: 30000 }); }

function syncWithUpstream(s) {
  const f = fetchUpstream(s.worktree); if (f.code !== 0) return { synced: false, reason: `fetch failed: ${f.stderr}` };
  const remote = git(['rev-parse', '--verify', `origin/${s.base}`], s.worktree).code === 0;
  const baseRef = remote ? `origin/${s.base}` : s.base;
  const r = git(['rebase', baseRef], s.worktree, { timeoutMs: 60000 });
  if (r.code !== 0) { git(['rebase', '--abort'], s.worktree); return { synced: false, baseRef, reason: r.stderr || 'rebase conflict' }; }
  return { synced: true, baseRef };
}

function commitsAheadOfBase(s) { const r = git(['rev-list', '--count', `${s.base}..HEAD`], s.worktree); return r.code === 0 ? Number(r.stdout || '0') || 0 : 0; }

function detectTestCommand(wt) {
  if (fs.existsSync(path.join(wt, 'package.json'))) return 'npm test';
  if (fs.existsSync(path.join(wt, 'Cargo.toml'))) return 'cargo test';
  if (fs.existsSync(path.join(wt, 'go.mod'))) return 'go test ./...';
  if (fs.existsSync(path.join(wt, 'pyproject.toml')) || fs.existsSync(path.join(wt, 'requirements.txt'))) return 'pytest';
  return null;
}

/**
 * D15 : le choix au mtime est supprimé (aucune causalité entre date de
 * modification et présence de bug). Ne pas réintroduire de tri temporel
 * ici : la localisation vient des détecteurs déterministes
 * (daemon/investigation) via les findings.
 */
async function runAutofixCycle() {
  return { attempted: false, reason: AUTOFIX_DEPRECATION_REASON };
}

function pushBranch(s) { return git(['push', '-u', 'origin', s.branch], s.worktree, { timeoutMs: 30000 }); }
function detectGithubSlug(rp) { const r = git(['remote', 'get-url', 'origin'], rp); return (r.stdout.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/i) || [])[1] || null; }
function ghCliAvailable() { return spawnSync('gh', ['--version'], { encoding: 'utf8', timeout: 5000 }).status === 0; }

function createGithubPr(s, slug) {
  const pr = spawnSync('gh', ['pr', 'create', '--repo', slug, '--head', s.branch, '--base', s.base, '--title', `[GenOS Daemon] Automated fixes on ${s.branch}`, '--body', 'Autonomous GenOS daemon fixes. Every commit was verified by this repository\'s own test suite before being applied.'], { cwd: s.worktree, encoding: 'utf8', timeout: 20000 });
  if (pr.status === 0) return { opened: true, pushed: true, url: (pr.stdout || '').trim() };
  if (/already exists/i.test(pr.stderr || '')) return { opened: true, pushed: true, reason: 'pull request already open' };
  return { opened: false, pushed: true, reason: pr.stderr || 'gh pr create failed' };
}

function openMergeRequest(repo, s) {
  if (MR_DISABLED) return { opened: false, reason: 'merge requests disabled via GENOS_DAEMON_DISABLE_PR' };
  const p = pushBranch(s); if (p.code !== 0) return { opened: false, pushed: false, reason: p.stderr || 'push failed' };
  const slug = detectGithubSlug(repo.path); return slug && ghCliAvailable() ? createGithubPr(s, slug) : { opened: false, pushed: true, reason: slug ? 'gh CLI unavailable' : 'origin remote is not a GitHub repository' };
}

function recordSkippedRepo({ state, key, previousRecord, reason }) { const r = { ...previousRecord, status: 'skipped', reason, updatedAt: new Date().toISOString() }; state[key] = r; saveState(state); return r; }
async function resolveCycleFix(repo, s, sync) { const r = await runAutofixCycle(); return sync.synced ? r : { attempted: false, reason: `sync failed: ${sync.reason}` }; }
function resolveAheadCount(s, sync, prev) { return sync.synced ? commitsAheadOfBase(s) : prev.commitsAheadOfBase || 0; }
function maybeOpenMergeRequest({ repo, session, sync, ahead, previousRequest }) { if (!(sync.synced && ahead > 0 && (!previousRequest || previousRequest.commitCount !== ahead))) return previousRequest || null; const mr = openMergeRequest(repo, session); return { ...mr, commitCount: ahead, updatedAt: new Date().toISOString() }; }

function buildCycleRecord({ session, sync, fix, ahead, mergeRequest, previousRecord }) {
  return { branch: session.branch, base: session.base, worktree: session.worktree, status: !sync.synced ? 'sync_conflict' : (fix.applied ? 'fix_committed' : 'watching'), lastSync: sync, lastFix: fix, commitsAheadOfBase: ahead, mergeRequest, updatedAt: new Date().toISOString(), history: [...(previousRecord.history || []).slice(-19), { at: new Date().toISOString(), synced: sync.synced, fix: fix.attempted ? (fix.applied ? 'applied' : 'skipped') : 'no-op' }] };
}

function emitCycleTelemetry({ repo, session, sync, fix, ahead, mergeRequest }) {
  telemetry.emitEvent({ eventType: fix.applied ? 'DAEMON_REPO_FIX_COMMITTED' : 'DAEMON_REPO_CYCLE', agentId: `daemon:${repo.name}`, action: 'AUTONOMOUS_MAINTENANCE', detail: fix.applied ? `Committed a verified fix on ${session.branch}: ${fix.evidence}` : (fix.reason || sync.reason || 'cycle completed'), severity: sync.synced ? 'info' : 'warning', payload: { repo: repo.name, branch: session.branch, base: session.base, commitsAheadOfBase: ahead, mergeRequest } });
}

async function runRepoDaemonCycle(repo) {
  const state = loadState(), key = path.resolve(repo.path), rec = state[key] || { history: [] };
  const s = ensureDaemonWorktree(repo); if (!s) return recordSkippedRepo({ state, key, previousRecord: rec, reason: 'not a usable git repository' });
  const sync = syncWithUpstream(s), fix = await resolveCycleFix(repo, s, sync), ahead = resolveAheadCount(s, sync, rec), mr = maybeOpenMergeRequest({ repo, session: s, sync, ahead, previousRequest: rec.mergeRequest }), upd = buildCycleRecord({ session: s, sync, fix, ahead, mergeRequest: mr, previousRecord: rec });
  emitCycleTelemetry({ repo, session: s, sync, fix, ahead, mergeRequest: mr }); state[key] = upd; saveState(state); return upd;
}

async function runFleetDaemonCycle(repos) {
  const res = []; for (const repo of repos) { try { res.push({ repo: repo.name, ...(await runRepoDaemonCycle(repo)) }); } catch (e) { res.push({ repo: repo.name, status: 'error', reason: e.message }); } } return res;
}

module.exports = { daemonBranchName, worktreePath, ensureDaemonWorktree, syncWithUpstream, fetchUpstream, commitsAheadOfBase, detectTestCommand, runAutofixCycle, openMergeRequest, runRepoDaemonCycle, runFleetDaemonCycle, loadState, saveState, AUTOFIX_DEPRECATION_REASON };