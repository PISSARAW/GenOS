'use strict';

const assert = require('assert');
const { defaultConfig, validateProjectConfig } = require('../src/services/ontogenesis/configSchema');
const gitAuthority = require('../src/services/ontogenesis/gitAuthority');
const integration = require('../src/services/ontogenesis/integrationService');
const control = require('../src/services/ontogenesis/controlService');
const { requestFor } = require('../src/services/ontogenesis/runtimeHarness');

function configWithCheck(program, args) {
  const config = defaultConfig();
  config.checks = [{ program, args }];
  return config;
}

function request(authority = { allowEdit: false, allowTests: true }) {
  return requestFor({ id: 'run-boundary', project: { id: 'project', objective: 'Verifier' },
    task: { id: 'task', title: 'Boundary', acceptance_json: '[]' }, selection: { topology: 'trinity', variant: 'default' },
    mission: {}, worktree: '/tmp/candidate', budgets: { tokens: 10, usd: 0, seconds: 10 },
    config: { checks: [{ program: 'npm', args: ['test'] }], authority } });
}

function rejectsExternalChecks() {
  const push = validateProjectConfig(configWithCheck('git', ['push', 'origin', 'HEAD']));
  assert.ok(push.errors.includes('verification-git-push-hors-autorite'));
  const merge = validateProjectConfig(configWithCheck('C:\\Program Files\\Git\\cmd\\git.cmd', ['-c', 'x=y', 'merge', 'main']));
  assert.ok(merge.errors.includes('verification-git-merge-hors-autorite'));
  for (const args of [['fetch', 'origin'], ['remote', 'update'], ['pull'], ['clone', 'url', 'repo'],
    ['checkout', 'main'], ['commit', '-m', 'unsafe'], ['-C', '/tmp/repo', 'fetch', 'origin']]) {
    const rejected = validateProjectConfig(configWithCheck('git', args));
    assert.ok(rejected.errors.includes(`verification-git-${args.includes('-C') ? 'fetch' : args[0]}-hors-autorite`),
      `must reject git ${args.join(' ')}`);
  }
  for (const args of [['status', '--short'], ['diff', '--check'], ['log', '-1'],
    ['ls-files'], ['merge-base', 'HEAD', 'main'], ['rev-parse', '--show-toplevel']]) {
    assert.strictEqual(validateProjectConfig(configWithCheck('git', args)).ok, true,
      `must allow read-only git ${args.join(' ')}`);
  }
  assert.strictEqual(validateProjectConfig(configWithCheck('C:\\Program Files\\Git\\cmd\\git.exe',
    ['-C', '/tmp/repo', 'fetch', 'origin'])).ok, false);
  assert.throws(() => requestFor({ id: 'run-boundary', project: { id: 'project', objective: 'Verifier' },
    task: { id: 'task', title: 'Boundary', acceptance_json: '[]' },
    selection: { topology: 'trinity', variant: 'default' }, mission: {}, worktree: '/tmp/candidate',
    budgets: { tokens: 10, usd: 0, seconds: 10 },
    config: { checks: [{ program: 'git', args: ['fetch', 'origin'] }],
      authority: { allowEdit: false, allowTests: true } } }), /verification-git-fetch-hors-autorite/);
}

async function guardsIntegrationGit() {
  const calls = [];
  const git = integration.createShellGit(async (...args) => { calls.push(args); return { stdout: '' }; });
  await git.run(['status', '--porcelain'], '/tmp/worktree');
  assert.throws(() => git.run(['push', 'origin', 'HEAD'], '/tmp/worktree'),
    /operation-git-hors-autorite:push/);
  assert.throws(() => git.run(['merge', 'main'], '/tmp/worktree'),
    /operation-git-hors-autorite:merge/);
  assert.strictEqual(calls.length, 1);
}

async function main() {
  rejectsExternalChecks();
  await guardsIntegrationGit();
  assert.strictEqual(gitAuthority.gitSubcommand(['-C', '/tmp/repo', 'push']), 'push');
  assert.deepStrictEqual(control.deliveryBoundary('abc123'), {
    localCommit: 'abc123', push: 'outside_authority', merge: 'outside_authority'
  });
  const mission = request();
  assert.strictEqual(mission.allow_file_edits, false);
  assert.deepStrictEqual(mission.git_authority,
    { localCommit: false, push: false, merge: false, remoteMutation: false });
  assert.match(mission.mission, /do not commit, push, merge, or alter remotes/);
  console.log('ontogenesis release boundary checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
