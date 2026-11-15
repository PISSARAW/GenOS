'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const territories = require('../src/services/daemon/daemonTerritoryService');
const runtimeService = require('../src/services/daemon/residentDaemonRuntime');
const cycleService = require('../src/services/daemon/residentDaemonCycleService');
const eventBridge = require('../src/services/daemon/daemonEventBridgeService');
const eventConsumer = require('../src/services/daemon/daemonEventConsumerService');
const observerService = require('../src/services/daemon/repositoryObserverService');
const findingService = require('../src/services/daemon/findings/findingService');
const productionBridge = require('../src/services/daemon/daemonProductionBridge');
const missionHelpers = require('../bin/orchestratorMissionHelpers.cjs');

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
}

function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-daemon-observer-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'daemon-test@example.invalid']);
  git(root, ['config', 'user.name', 'Daemon Test']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
  fs.writeFileSync(path.join(root, 'healthy.js'), 'module.exports = 1;\n');
  fs.mkdirSync(path.join(root, 'ignored'));
  fs.writeFileSync(path.join(root, 'ignored', 'cached.js'), 'module.exports = 2;\n');
  git(root, ['add', '.gitignore', 'healthy.js']);
  git(root, ['commit', '-m', 'fixture']);
  return { root, headSha: git(root, ['rev-parse', 'HEAD']) };
}

async function createContext(db, repository) {
  await territories.createTerritory(db, {
    id: 'territory.observer-e2e', organizationId: 'org-test', projectId: 'project-test',
    workspaceId: 'workspace-test', repoIdentity: 'observer-e2e', rootPath: repository.root,
    scopePath: '/', ref: 'main', headSha: repository.headSha, state: 'BOOTSTRAPPING'
  });
  const runtime = runtimeService.createRuntime(db);
  await runtimeService.registerDaemon(runtime, {
    daemonId: 'daemon.observer-e2e', territoryId: 'territory.observer-e2e'
  });
  const bridge = eventBridge.createBridge({
    db, runtime, daemonId: 'daemon.observer-e2e', deferInvestigation: true
  });
  return { db, runtime, bridge, daemonId: 'daemon.observer-e2e',
    territoryId: 'territory.observer-e2e' };
}

async function main() {
  const repository = createRepository();
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const context = await createContext(db, repository);
    await cycleService.runCycle(context);
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM territory_graph_nodes WHERE path = 'ignored/cached.js'")).n, 0);
    await eventConsumer.initializeCursor(context);

    fs.writeFileSync(path.join(repository.root, 'broken.js'),
      "module.exports = require('./missing-module');\n");
    const observer = await observerService.createObserver({
      db, territoryId: context.territoryId, rootPath: repository.root
    });
    const observed = await observerService.observeRepository(observer);
    assert.equal(observed.worktree.ingested, true);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM daemon_events')).n, 1);

    const delivery = await eventConsumer.pollDaemonEvents(context);
    assert.equal(delivery.count, 1);
    assert.equal((await runtimeService.getDaemonState(context.runtime,
      { daemonId: context.daemonId })).activity, 'FOCUSED');
    await cycleService.runCycle(context);

    const findings = await findingService.listFindings(db, { territoryId: context.territoryId });
    const broken = findings.find((finding) => finding.detectorId === 'broken-import');
    assert.ok(broken, 'the repository observation must produce a finding');

    const entered = await productionBridge.announceMissionStart({ db,
      request: { workspaceRoot: repository.root, mission: 'inspect broken.js' } });
    assert.equal(entered.announced, true);
    assert.ok(entered.handoffSignal?.briefId);
    const prompt = await missionHelpers.attachTerritoryBrief(db, 'Inspect the repository.',
      entered.handoffSignal);
    assert.match(prompt, /RESIDENT DAEMON TERRITORY BRIEF/);
    assert.match(prompt, /broken\.js imports unresolvable/);
  } finally {
    await db.close();
    fs.rmSync(repository.root, { recursive: true, force: true });
  }
  console.log('Daemon repository observer E2E: repository change -> finding -> mission brief PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
