/**
 * approveTrajectory must really merge the diff into the workspace file (and
 * commit it when the workspace is a git worktree) instead of returning the
 * old hard-coded 501 TRAJECTORY_MERGE_NOT_IMPLEMENTED.
 */
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-traj-approve-'));
process.env.GENOS_WORKSPACES_ROOT = root;

const workspacePath = path.join(root, 'ws-approve-test');
fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
fs.writeFileSync(path.join(workspacePath, 'src', 'thing.js'), 'old line 1\nold line 2\n');
execFileSync('git', ['init', '-q'], { cwd: workspacePath });
execFileSync('git', ['config', 'user.email', 'test@genos.local'], { cwd: workspacePath });
execFileSync('git', ['config', 'user.name', 'GenOS Test'], { cwd: workspacePath });
execFileSync('git', ['add', '-A'], { cwd: workspacePath });
execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: workspacePath });

const dbModule = require('../src/db');
const originalGetDatabase = dbModule.getDatabase;
const runs = [];
const trajectoryRow = {
  id: 'traj-approve-1',
  workspace_id: 'ws-approve-test',
  status: 'pending',
  title: 'Fix thing.js',
  diff_file: 'src/thing.js',
  diff_lines: JSON.stringify([
    { type: 'context', content: 'old line 1' },
    { type: 'deletion', content: 'old line 2' },
    { type: 'addition', content: 'new line 2' }
  ])
};

dbModule.getDatabase = async () => ({
  get: async (sql, ...args) => {
    if (sql.includes('FROM trajectories t JOIN workspaces w')) return trajectoryRow;
    if (sql.includes('SELECT id, path FROM workspaces')) return { id: 'ws-approve-test', path: workspacePath };
    return null;
  },
  all: async () => [],
  run: async (sql, ...args) => { runs.push({ sql, args }); return { changes: 1 }; }
});

delete require.cache[require.resolve('../src/services/workspaceRegistry')];
delete require.cache[require.resolve('../src/controllers/trajectoryController')];
const trajectoryController = require('../src/controllers/trajectoryController');

(async () => {
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; }
  };

  await trajectoryController.approveTrajectory({ params: { id: 'traj-approve-1' }, tenant: null }, res);

  assert.equal(statusCode, 200, `Expected 200, got ${statusCode}: ${JSON.stringify(body)}`);
  assert.equal(body.success, true, 'Response reports success');
  assert.equal(body.status, 'active', 'Trajectory transitions to active');
  assert.equal(body.mutated, true, 'Response reports mutation');
  assert.equal(body.commit.committed, true, 'Merge committed to the git worktree');
  assert.ok(body.commit.sha, 'Commit sha is returned');

  const merged = fs.readFileSync(path.join(workspacePath, 'src', 'thing.js'), 'utf8');
  assert.equal(merged, 'old line 1\nnew line 2\n', 'Deleted line dropped, added line applied');

  const log = execFileSync('git', ['log', '--oneline', '-1'], { cwd: workspacePath }).toString();
  assert.ok(log.includes('traj-approve-1'), 'Commit message references the trajectory id');

  const updateCall = runs.find((r) => r.sql.includes("UPDATE trajectories SET status = 'active'"));
  assert.ok(updateCall, 'Trajectory status update was persisted');

  console.log('approveTrajectory real-merge test passed.');
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(() => {
  dbModule.getDatabase = originalGetDatabase;
  fs.rmSync(root, { recursive: true, force: true });
});
