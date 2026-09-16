/**
 * Daemon Repo Worker Service - maintains persistent git worktrees per repo,
 * rebases onto human branch, applies verified fixes, opens PRs via gh CLI.
 */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const modelRouter = require('./modelRouter'), localCodeWorker = require('./localCodeWorkerService'), telemetry = require('./telemetryObserver');

const repoRoot = path.resolve(__dirname, '../../..');
const stateFile = path.join(repoRoot, '.genos', 'daemon_repo_state.json');
const lockFile = stateFile + '.lock';
const DAEMON_BRANCH_PREFIX = 'genos-daemon', WORKTREE_ROOT_NAME = '.genos-daemon-worlds';
const AUTOFIX_DISABLED = /^(1|true)$/i.test(process.env.GENOS_DAEMON_DISABLE_AUTOFIX || '');
const MR_DISABLED = /^(1|true)$/i.test(process.env.GENOS_DAEMON_DISABLE_PR || '');
const MODEL_TIMEOUT_MS = Number(process.env.GENOS_DAEMON_MODEL_TIMEOUT_MS) || 90000;
const MAX_PROMPT_CHARS = Number(process.env.GENOS_DAEMON_MAX_PROMPT_CHARS) || 80000;

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

function listCandidateFiles(wt) {
  const r = git(['ls-files'], wt); if (r.code !== 0) return [];
  return r.stdout.split('\n').map(f => f.trim()).filter(Boolean).filter(f => localCodeWorker.safePath(f)).filter(f => /\.(js|ts|tsx|jsx|py|rs|go|java|rb|cjs|mjs)$/i.test(f));
}

function pickCandidateFile(wt) {
  const files = listCandidateFiles(wt).map(rel => { try { const st = fs.statSync(path.join(wt, rel)); return { rel, mtime: st.mtimeMs, size: st.size }; } catch { return null; } }).filter(f => f && f.size > 0 && f.size < 60000);
  files.sort((a, b) => b.mtime - a.mtime); return files[0] || null;
}

async function checkDeadEnd(key) {
  try { const m = require('./primitiveHandlers/memoryDeadEnds'); return await m.avoidKnownDeadEnds({ task: key, agentId: 'daemon' }); }
  catch (e) { console.warn(`[Daemon] checkDeadEnd failed for ${key}:`, e.message); return { isDeadEndRisk: false, warning: null }; }
}

async function recordOutcome({ taskKey, repoName, relPath, success, detail }) {
  try {
    const vm = require('./vectorMemoryService');
    await vm.storeMemory('daemon', success ? `Fixed ${relPath} in ${repoName}: ${detail}` : `Attempted fix on ${taskKey} did not pan out: ${detail}`, null, {
      category: success ? 'Experience' : 'Failure', title: success ? `Daemon fix: ${repoName}/${relPath}` : `Daemon dead end: ${taskKey}`
    });
  } catch (_) {}
}

function resolveDeadEndWarning(d) { return d.isDeadEndRisk ? `\n\nKNOWN DEAD END: ${d.warning || 'a previous attempt on this file did not work.'} Propose a materially different, more conservative fix or return an empty patch.` : ''; }

function buildAutofixPrompt({ repo, candidate, testCommand, content, deadEndWarning }) {
  const c = content.length > MAX_PROMPT_CHARS ? content.slice(0, MAX_PROMPT_CHARS) + '\n... [truncated]' : content;
  return [`You are the GenOS autonomous maintainer daemon for the repository "${repo.name}".`, `Review the file "${candidate.rel}" below for one concrete, narrowly-scoped bug or inconsistency you can fix with high confidence.`, 'If you find a genuine fix, return exactly this JSON object and nothing else:', `{"format":"genos.file-replacement/v1","patches":[{"path":"${candidate.rel}","content":"<complete corrected file content>"}],"tests":["${testCommand}"],"evidence":"<what was wrong and why this fixes it>"}`, `If nothing needs fixing, return {"format":"genos.file-replacement/v1","patches":[],"tests":["${testCommand}"],"evidence":"no fix needed"}.`, 'Never invent an issue; an empty patches array is a valid and expected outcome. Never touch tests, lockfiles, manifests, or secrets.' + deadEndWarning, '--- FILE CONTENT ---', c].join('\n\n');
}

async function requestDaemonProposal({ repo, taskKey, prompt, candidate }) {
  let gen; try { gen = await modelRouter.generate({ db: null, agentId: `daemon:${repo.name}`, prompt, timeoutMs: MODEL_TIMEOUT_MS }); }
  catch (e) { await recordOutcome({ taskKey, repoName: repo.name, relPath: candidate.rel, success: false, detail: `model routing failed: ${e.message}` }); return { error: `model routing failed: ${e.message}` }; }
  let prop; try { prop = localCodeWorker.parseProposal(gen.text || ''); }
  catch (e) { await recordOutcome({ taskKey, repoName: repo.name, relPath: candidate.rel, success: false, detail: `invalid proposal: ${e.message}` }); return { error: `invalid proposal: ${e.message}` }; }
  return { generated: gen, proposal: prop };
}

async function executeVerifiedPatch({ repo, session, candidate, taskKey, fetched }) {
  let res; try { res = await localCodeWorker.executeProposal({ workspaceRoot: session.worktree, text: fetched.generated.text }); }
  catch (e) { await recordOutcome({ taskKey, repoName: repo.name, relPath: candidate.rel, success: false, detail: `patch execution failed: ${e.message}` }); return { attempted: true, applied: false, file: candidate.rel, reason: `patch execution failed: ${e.message}` }; }
  if (res.testStatus !== 'passed') { await recordOutcome({ taskKey, repoName: repo.name, relPath: candidate.rel, success: false, detail: `tests failed after patch, rolled back: ${JSON.stringify(res.tests)}` }); return { attempted: true, applied: false, file: candidate.rel, reason: 'tests failed after patch; rolled back', tests: res.tests }; }
  const msg = `[GenOS Daemon] ${fetched.proposal.evidence || 'Automated fix'}`.slice(0, 240);
  git(['add', '-u'], session.worktree); const cr = git(['commit', '-m', msg], session.worktree);
  const ok = cr.code === 0; await recordOutcome({ taskKey, repoName: repo.name, relPath: candidate.rel, success: ok, detail: fetched.proposal.evidence || 'automated fix' });
  return { attempted: true, applied: ok, file: candidate.rel, evidence: fetched.proposal.evidence, tests: res.tests };
}

async function runAutofixCycle(repo, s) {
  if (AUTOFIX_DISABLED) return { attempted: false, reason: 'autofix disabled via GENOS_DAEMON_DISABLE_AUTOFIX' };
  const tc = detectTestCommand(s.worktree); if (!tc) return { attempted: false, reason: 'no allow-listed test command detected for this repository' };
  const cand = pickCandidateFile(s.worktree); if (!cand) return { attempted: false, reason: 'no eligible source file found' };
  const key = `${repo.name}:${cand.rel}`, dw = resolveDeadEndWarning(await checkDeadEnd(key)), cnt = fs.readFileSync(path.join(s.worktree, cand.rel), 'utf8');
  const f = await requestDaemonProposal({ repo, taskKey: key, prompt: buildAutofixPrompt({ repo, candidate: cand, testCommand: tc, content: cnt, deadEndWarning: dw }), candidate: cand });
  if (f.error) return { attempted: true, applied: false, reason: f.error };
  if (!f.proposal.patches.length) return { attempted: true, applied: false, file: cand.rel, reason: f.proposal.evidence || 'no fix needed' };
  return executeVerifiedPatch({ repo, session: s, candidate: cand, taskKey: key, fetched: f });
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
function resolveCycleFix(repo, s, sync) { return sync.synced ? runAutofixCycle(repo, s) : { attempted: false, reason: `sync failed: ${sync.reason}` }; }
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

module.exports = { daemonBranchName, worktreePath, ensureDaemonWorktree, syncWithUpstream, fetchUpstream, commitsAheadOfBase, detectTestCommand, pickCandidateFile, runAutofixCycle, openMergeRequest, runRepoDaemonCycle, runFleetDaemonCycle, loadState, saveState };