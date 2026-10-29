'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const fixture = require('./ontogenesisFixture');
const { dockerReadiness } = require('../src/services/ontogenesis/readinessService');

const CLI = path.resolve(__dirname, '../bin/genos-ontogenesis.cjs');

function execute(context, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, GENOS_DB_PATH: context.database, GENOS_DB_BOOTSTRAP_SKIP: '1', GENOS_DB_BACKUP_SKIP: '1' },
    encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.ifError(result.error);
  return result;
}

function invoke(context, args, expected = 0) {
  const result = execute(context, args);
  assert.strictEqual(result.status, expected, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function assertProjectMissing(database, projectId) {
  const { open } = require('sqlite');
  const db = await open({ filename: database, driver: require('sqlite3').Database });
  try {
    assert.strictEqual(await db.get('SELECT id FROM ontogenesis_projects WHERE id = ?', [projectId]), undefined);
  } finally {
    await db.close();
  }
}

async function rejectInit(context, input) {
  const args = ['init', '--root', input.root, '--project', input.projectId];
  if (input.config) args.push('--config', input.config);
  const result = execute(context, args);
  assert.strictEqual(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /--root|branche Git/);
  await assertProjectMissing(context.database, input.projectId);
}

async function createPreflightFailureProject(context, nonGitRoot) {
  const projectId = 'onto_preflight_invalid_root';
  const task = JSON.parse(invoke(context, ['task', '--project', projectId, '--title', 'Must not start'])).taskId;
  const { open } = require('sqlite');
  const db = await open({ filename: context.database, driver: require('sqlite3').Database });
  try {
    await db.run('UPDATE ontogenesis_projects SET root_path = ? WHERE id = ?', [nonGitRoot, projectId]);
  } finally {
    await db.close();
  }
  return { projectId, task };
}

async function assertNoPreflightEffects(database, input) {
  const { open } = require('sqlite');
  const db = await open({ filename: database, driver: require('sqlite3').Database });
  try {
    assert.strictEqual(await db.get('SELECT project_id FROM ontogenesis_claims WHERE project_id = ?', [input.projectId]), undefined);
    assert.strictEqual((await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?', [input.task])).status, 'todo');
  } finally {
    await db.close();
  }
}

async function testConditionalDockerReadiness(root) {
  let probes = 0;
  const probe = async (_root, images) => {
    probes += 1;
    assert.deepStrictEqual(images, ['registry.invalid/verifier@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
  };
  const noDocker = await dockerReadiness({ checks: [{ program: 'npm', args: ['test'] }] }, root, probe);
  assert.strictEqual(noDocker, 'not_required');
  assert.strictEqual(probes, 0);
  const required = await dockerReadiness({ checks: [
    { sandbox: { runtime: 'docker', image: 'registry.invalid/verifier@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } },
    { sandbox: { runtime: 'docker', image: 'registry.invalid/verifier@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }
  ] }, root, probe);
  assert.strictEqual(required, 'ready');
  assert.strictEqual(probes, 1);
  await assert.rejects(dockerReadiness({ checks: [
    { sandbox: { runtime: 'docker', image: 'registry.invalid/verifier@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }
  ] }, root, async () => { throw new Error('moteur-docker-indisponible'); }), /moteur-docker-indisponible/);
}

async function main() {
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-cli-test-'));
  const nonGitRoot = path.join(scratch, 'not-a-repository');
  const unbornRoot = path.join(scratch, 'unborn-repository');
  const nestedRoot = path.join(root, 'nested');
  const worktree = path.join(scratch, 'linked-worktree');
  const context = { database: path.join(scratch, 'genos.db') };
  try {
    await db.run('VACUUM INTO ?', [context.database]);
    const config = path.join(scratch, 'config.json');
    fs.writeFileSync(config, JSON.stringify(fixture.testConfig()));
    fs.mkdirSync(nonGitRoot);
    fs.mkdirSync(nestedRoot);
    fs.mkdirSync(unbornRoot);
    const { runCommand } = require('../src/services/agentWorkspaceLifecycle/git');
    await runCommand('git', ['init', '-b', 'main'], { cwd: unbornRoot });
    await testConditionalDockerReadiness(root);
    await rejectInit(context, { root: path.join(scratch, 'missing'), projectId: 'onto_cli_missing_root' });
    await rejectInit(context, { root: nonGitRoot, projectId: 'onto_cli_non_git_root' });
    await rejectInit(context, { root: nestedRoot, projectId: 'onto_cli_nested_root' });
    const invalidBranchConfig = { ...fixture.testConfig(), branch: 'invalid..branch',
      authority: { ...fixture.testConfig().authority, branches: ['invalid..branch'] } };
    fs.writeFileSync(config, JSON.stringify(invalidBranchConfig));
    await rejectInit(context, { root, projectId: 'onto_cli_invalid_branch', config });
    fs.writeFileSync(config, JSON.stringify(fixture.testConfig()));
    await runCommand('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], { cwd: root });
    assert.ok(fs.statSync(path.join(worktree, '.git')).isFile(), 'linked worktree uses a .git file');
    assert.match(invoke(context, ['init', '--root', worktree, '--project', 'onto_cli_worktree', '--config', config]),
      /projet-cree:onto_cli_worktree/);
    assert.match(invoke(context, ['init', '--root', root, '--project', 'onto_cli', '--config', config]), /projet-cree:onto_cli/);
    assert.match(invoke(context, ['preflight', '--project', 'onto_cli']), /"status":"ready"/);
    assert.match(invoke(context, ['preflight', '--project', 'onto_cli']), /"docker":"not_required"/);
    const busyBranchConfig = fixture.testConfig();
    busyBranchConfig.branch = 'main';
    busyBranchConfig.authority.branches = ['main'];
    fs.writeFileSync(config, JSON.stringify(busyBranchConfig));
    invoke(context, ['init', '--root', root, '--project', 'onto_busy_branch', '--config', config]);
    const busyBranchPreflight = execute(context, ['preflight', '--project', 'onto_busy_branch']);
    assert.strictEqual(busyBranchPreflight.status, 1);
    assert.match(busyBranchPreflight.stderr, /branche-integration-deja-extraite/);
    fs.writeFileSync(config, JSON.stringify(fixture.testConfig()));
    invoke(context, ['init', '--root', unbornRoot, '--project', 'onto_unborn_repo', '--config', config]);
    const unbornPreflight = execute(context, ['preflight', '--project', 'onto_unborn_repo']);
    assert.strictEqual(unbornPreflight.status, 1);
    assert.match(unbornPreflight.stderr, /commit-initial-requis-pour-worktree-integration/);
    assert.match(invoke(context, ['init', '--root', root, '--project', 'onto_preflight_invalid_root', '--config', config]),
      /projet-cree:onto_preflight_invalid_root/);
    const invalidProject = await createPreflightFailureProject(context, nonGitRoot);
    const refusedPreflight = execute(context, ['preflight', '--project', invalidProject.projectId]);
    assert.strictEqual(refusedPreflight.status, 1);
    const refusedTick = execute(context, ['tick', '--project', invalidProject.projectId]);
    assert.strictEqual(refusedTick.status, 1);
    assert.match(refusedTick.stderr, /--root doit être un dépôt Git valide/);
    await assertNoPreflightEffects(context.database, { projectId: invalidProject.projectId, task: invalidProject.task });
    const flags = ['--project', 'onto_cli'];
    const task = JSON.parse(invoke(context, ['task', ...flags, '--title', 'CLI task', '--acceptance', '["Complete"]'])).taskId;
    invoke(context, ['priority', ...flags, '--task', task, '--priority', '70']);
    invoke(context, ['message', ...flags, '--body', 'Preserver la compatibilite']);
    invoke(context, ['pause', ...flags, '--reason', 'No provider execution in this test']);
    assert.strictEqual(JSON.parse(invoke(context, ['tick', ...flags])).state, 'PAUSED');
    const tasks = JSON.parse(invoke(context, ['tasks', ...flags]));
    assert.strictEqual(tasks.find((row) => row.id === task).priority, 70);
    const status = JSON.parse(invoke(context, ['status', ...flags, '--json']));
    assert.strictEqual(status.control, 'paused');
    assert.strictEqual(status.pendingInbox, 0);
    invoke(context, ['budgets', ...flags, '--tokens', '180000', '--usd', '2', '--seconds', '400', '--reason', 'Operator decision']);
    assert.match(invoke(context, ['attempt-limit', ...flags, '--max-attempts', '4', '--reason', 'One bounded recovery attempt']), /"maxAttempts":4/);
    invoke(context, ['resume', ...flags]);
    invoke(context, ['stop', ...flags]);
    assert.strictEqual(JSON.parse(invoke(context, ['tick', ...flags])).state, 'STOPPED');
    invoke(context, ['resume', ...flags], 1);
    assert.strictEqual(JSON.parse(invoke(context, ['run', ...flags, '--interval-ms', '10', '--max-ticks', '1'])).state, 'STOPPED');
    invoke(context, ['run', ...flags, '--interval-ms', '-1', '--max-ticks', '1'], 1);
    invoke(context, ['prune', ...flags, '--days', '-1'], 1);
    console.log('ontogenesis operator CLI checks passed (separate processes, persistent SQLite, no external provider).');
  } finally {
    if (fs.existsSync(worktree)) {
      const { runCommand } = require('../src/services/agentWorkspaceLifecycle/git');
      await runCommand('git', ['worktree', 'remove', '--force', worktree], { cwd: root });
    }
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
