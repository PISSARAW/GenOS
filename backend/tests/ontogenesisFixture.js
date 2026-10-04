'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCommand } = require('../src/services/agentWorkspaceLifecycle/git');

async function memoryDb() {
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: require('sqlite3').Database });
  const migrations = ['migrateOntogenesis', 'migrateOntogenesisConversation', 'migrateOntogenesisSchedule',
    'migrateOntogenesisQuestions', 'migrateOntogenesisExecution', 'migrateOntogenesisLedger',
    'migrateShevProjectLoop', 'migrateGvxLedger'];
  for (const name of migrations) await require(`../src/db/migrations/${name}`)[name](db);
  return db;
}

async function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-runtime-test-'));
  await runCommand('git', ['init', '-b', 'main'], { cwd: root });
  await runCommand('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
  await runCommand('git', ['config', 'user.name', 'Ontogenesis Test'], { cwd: root });
  fs.writeFileSync(path.join(root, '.gitignore'), '.genos/\n');
  fs.writeFileSync(path.join(root, 'app.js'), 'module.exports = "initial";\n');
  await runCommand('git', ['add', '.gitignore', 'app.js'], { cwd: root });
  await runCommand('git', ['commit', '-m', '[TEST] Initial'], { cwd: root });
  return root;
}

function testConfig() {
  const config = require('../src/services/ontogenesis/configSchema').defaultConfig();
  config.checks = [{ program: process.execPath, args: ['-e', 'if (require("./app") !== "complete") process.exit(1)'] }];
  config.memory.recoveryStableMs = 0;
  config.budgets.seconds = 300;
  return config;
}

function fakeHarness(db) {
  const workspaces = require('../src/services/ontogenesis/worktreeService');
  const service = {
    launches: 0, stops: 0, ownedMb: 100, freePct: 0.8, failTests: false, live: false,
    prepare: workspaces.ensureIntegration,
    resources: async () => ({ ownedMb: service.ownedMb,
      sample: { totalMb: 10000, freeMb: service.freePct * 10000, freePct: service.freePct, reservationsMb: 0 } }),
    observe: async () => ({ alive: service.live }),
    stop: async () => { service.stops += 1; service.live = false; return true; },
    start: (input) => startCandidate(db, service, input)
  };
  return service;
}

async function startCandidate(db, harness, input) {
  harness.launches += 1;
  const workspaces = require('../src/services/ontogenesis/worktreeService');
  const candidate = path.join(workspaces.managedRoot(input.project), 'capsules', input.id);
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  await runCommand('git', ['worktree', 'add', '--detach', candidate, input.baseSha], { cwd: input.worktree });
  fs.writeFileSync(path.join(candidate, 'app.js'), `module.exports = "${harness.failTests ? 'invalid' : 'complete'}";\n`);
  fs.writeFileSync(path.join(candidate, '.genos-epoch'), 'runtime-only');
  if (!harness.live) await require('../src/services/ontogenesis/executionStore').updateExecution(db, {
    id: input.id, phase: 'finished', result: { success: true, candidateWorktree: candidate }
  });
  return { pid: null, executable: 'injected-test-runtime' };
}

async function project(db, root) {
  const store = require('../src/services/ontogenesis/projectStore');
  const id = await store.createProject(db, { rootPath: root, branch: 'codex/ontogenesis', objective: 'complete', config: testConfig() });
  const task = await store.addTask(db, { projectId: id, title: 'complete app', acceptance: ['app exports complete'] });
  return { id, task };
}

module.exports = { memoryDb, repository, testConfig, fakeHarness, project };
