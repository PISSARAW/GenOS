'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, closeFixture } = require('./helpers/daemonCompletionFixture');
const runtime = require('../src/services/daemon/residentDaemonRuntime');
const cycle = require('../src/services/daemon/residentDaemonCycleService');
const bridge = require('../src/services/daemon/daemonEventBridgeService');
const cartographer = require('../src/services/daemon/cartography/cartographerService');
const catalog = require('../src/services/daemon/daemonTypeCatalog');
const compiler = require('../src/services/daemon/handoff/handoffCompilerService');
const territories = require('../src/services/daemon/daemonTerritoryService');
const phenotypes = require('../src/services/daemon/specialization/phenotypeService');
const execution = require('../src/services/daemon/specialization/phenotypeExecutionService');
const searchState = require('../src/services/daemon/daemonSearchStateService');
const controller = require('../src/controllers/residentDaemonController');

async function cycleContract(value) {
  const { context, db } = value;
  const first = await cycle.runCycle(context);
  assert.equal(first.cycled, true);
  assert.equal(first.index.indexed, 2);
  assert.equal((await runtime.getDaemonState(context.runtime, { daemonId: context.daemonId })).activity, 'DORMANT');
  assert.equal(first.phenotypes.length, 10);
  const eventBridge = bridge.createBridge({ ...context, deferInvestigation: true });
  await bridge.ingestEvent(eventBridge, { territoryId: context.territoryId, type: 'TERRITORY_FILE_CHANGED', payload: { file: 'probe.js' } });
  const [second, same] = await Promise.all([cycle.runCycle(context), cycle.runCycle(context)]);
  assert.strictEqual(second, same, 'one in-flight cycle per runtime');
  assert.ok(second.investigation.findings.some((finding) => finding.detectorId === 'broken-import'));
  const state = await runtime.getDaemonState(context.runtime, { daemonId: context.daemonId });
  assert.equal(state.activity, 'DORMANT');
  assert.equal(state.revisions, 0, 'ticks are not cognitive revisions');
  assert.ok(context.ledger.hypotheses.size > 0);
  const restored = { db, daemonId: context.daemonId, territoryId: context.territoryId };
  await searchState.ensure(restored);
  assert.deepEqual(restored.ledger.save().hypotheses, context.ledger.save().hypotheses);
  const rejected = await bridge.ingestEvent(eventBridge, { territoryId: 'territory.other', type: 'TEST_FAILED' });
  assert.equal(rejected.ingested, false);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM daemon_events')).n, 1);
}

async function confinementContract(value) {
  const { db, context, root } = value;
  const before = await db.get('SELECT COUNT(*) AS n FROM territory_graph_nodes');
  await assert.rejects(cartographer.updateFiles(db, { territoryId: context.territoryId, rootPath: root, files: ['../outside.js'] }), /outside territory/);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM territory_graph_nodes')).n, before.n);
  const refused = await cartographer.scanTerritory(db, { territoryId: context.territoryId, rootPath: root, scopePath: '../' });
  assert.equal(refused.scanned, false);
  const other = path.join(root, '.genos-agent-worlds');
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, 'secret.js'), 'secret');
  assert.ok(cartographer.walkFiles(root, '/').every((file) => !file.includes('.genos-agent-worlds')));
}

async function durabilityContract(value) {
  const { db, context } = value;
  const beatDb = context.runtime.db;
  context.runtime.db = { run: async () => { throw new Error('persistence down'); } };
  await assert.rejects(runtime.heartbeat(context.runtime, { daemonId: context.daemonId, revision: true }), /persistence down/);
  assert.equal((await runtime.getDaemonState(context.runtime, { daemonId: context.daemonId })).revisions, 0);
  context.runtime.db = beatDb;
  await Promise.all(Array.from({ length: 4 }, () => runtime.heartbeat(context.runtime, { daemonId: context.daemonId, revision: true })));
  assert.equal((await db.get('SELECT cognitive_revisions FROM daemon_runtime_state')).cognitive_revisions, 4);
  const resumed = runtime.createRuntime(db);
  const registration = await runtime.registerDaemon(resumed, { daemonId: context.daemonId, territoryId: context.territoryId });
  assert.equal(registration.activity, 'BOOTSTRAPPING');
  assert.equal(registration.revisions, 4);
  const occupant = await runtime.registerDaemon(resumed, { daemonId: 'daemon.conflict', territoryId: context.territoryId });
  assert.equal(occupant.registered, false);
}

async function handoffContract(value) {
  const { db, context } = value;
  const first = await compiler.compileBrief(db, { territoryId: context.territoryId, mission: 'inspect imports' });
  const second = await compiler.compileBrief(db, { territoryId: context.territoryId, mission: 'inspect imports' });
  assert.equal(first.brief.briefId, second.brief.briefId);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM daemon_handoffs')).n, 1);
  assert.equal(second.brief.summary.files, 2);
  assert.ok((await territories.getTerritory(db, { id: context.territoryId })).territory.lastIndexedAt);
}

async function typeContract(value) {
  const descriptor = catalog.describeTypes();
  assert.equal(descriptor.phenotypes.length, 10);
  assert.equal(descriptor.organelles.length, 8);
  assert.equal(descriptor.authority.filesystemWrite, false);
  for (const family of phenotypes.FAMILIES) {
    const selected = execution.selectDetectors([family]);
    assert.ok(execution.DETECTORS[family].every((id) => selected.some((detector) => detector.id === id)), family);
    assert.ok(execution.DETECTORS[family].includes(selected[0].id), `${family} affects detector priority`);
  }
  const unknown = await phenotypes.assignPhenotypes(value.db, { territoryId: 'territory.unknown' });
  assert.equal(unknown.assigned, false);
  let data;
  await controller.listDaemons({ db: value.db }, { json: (body) => { data = body; } }, (error) => { throw error; });
  assert.equal(data.daemons.length, 1);
  assert.equal(data.daemons[0].daemonId, value.context.daemonId);
}

async function recoveryContract(value) {
  const { db, context } = value;
  const previous = await db.get('SELECT COUNT(*) AS n FROM territory_graph_nodes');
  await runtime.heartbeat(context.runtime, { daemonId: context.daemonId, activity: 'BOOTSTRAPPING' });
  const invoke = db.run.bind(db);
  db.run = async (sql, ...args) => {
    if (sql.startsWith('DELETE FROM territory_graph_nodes')) throw new Error('injected graph failure');
    return invoke(sql, ...args);
  };
  try { await assert.rejects(cycle.runCycle(context), /injected graph failure/); }
  finally { db.run = invoke; }
  const state = await runtime.getDaemonState(context.runtime, { daemonId: context.daemonId });
  assert.equal(state.activity, 'BOOTSTRAPPING');
  assert.equal(state.health, 'DEGRADED');
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM territory_graph_nodes')).n, previous.n);
  const restored = { db, daemonId: context.daemonId, territoryId: context.territoryId };
  await searchState.ensure(restored);
  assert.equal(restored.retryInvestigation, true);
  const resumed = await cycle.runCycle(context);
  assert.equal(resumed.cycled, true);
  assert.equal(resumed.investigation.investigated, true);
  assert.equal(context.retryInvestigation, false);
}

async function main() {
  const value = await fixture();
  try {
    await cycleContract(value);
    await confinementContract(value);
    await handoffContract(value);
    await typeContract(value);
    await recoveryContract(value);
    await durabilityContract(value);
  } finally { await closeFixture(value); }
  console.log('Daemon completion contracts passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
