'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const investigator = require('../src/services/daemon/investigation/residentInvestigatorService');
const detectorRegistry = require('../src/services/daemon/investigation/anomalyDetectorRegistry');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const bridgeService = require('../src/services/daemon/daemonEventBridgeService');
const findingService = require('../src/services/daemon/findings/findingService');
const { HypothesisLedger } = require('../src/services/search/hypothesisLedgerService');

const HEAD_A = 'a'.repeat(40);

async function openDb() {
  const sqlite = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  return {
    run: (sql, ...args) => db.run(sql, ...args),
    get: (sql, ...args) => db.get(sql, ...args),
    all: (sql, ...args) => db.all(sql, ...args),
    exec: (sql) => db.exec(sql),
    close: () => db.close()
  };
}

async function main() {
  const db = await openDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-inv-'));
  fs.writeFileSync(path.join(root, 'broken.js'), "const x = require('./nonexistent');\nmodule.exports = x;\n");
  fs.writeFileSync(path.join(root, 'lonely.js'), "function lonely() { return 1; }\nmodule.exports = { lonely };\n");
  fs.writeFileSync(path.join(root, 'covered.js'), "function covered() { return 2; }\nmodule.exports = { covered };\n");
  fs.writeFileSync(path.join(root, 'covered.test.js'), "const c = require('./covered');\nif (!c) throw new Error('x');\n");

  await territoryService.createTerritory(db, {
    id: 'territory.inv-test',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'inv-test',
    rootPath: root,
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });

  const bridge = bridgeService.createBridge({ db });
  const fail = { file: 'backend/tests/auth.test.js' };
  await bridgeService.ingestEvent(bridge, { type: 'TEST_FAILED', territoryId: 'territory.inv-test', payload: fail });
  await bridgeService.ingestEvent(bridge, { type: 'TEST_FAILED', territoryId: 'territory.inv-test', payload: fail });
  await bridgeService.ingestEvent(bridge, { type: 'TEST_FAILED', territoryId: 'territory.inv-test', payload: { file: 'flaky.test.js' } });
  await bridgeService.ingestEvent(bridge, { type: 'TEST_RECOVERED', territoryId: 'territory.inv-test', payload: { file: 'flaky.test.js' } });
  await bridgeService.ingestEvent(bridge, { type: 'TERRITORY_FILE_CHANGED', territoryId: 'territory.inv-test', payload: { files: ['broken.js', 'lonely.js', 'covered.js'] } });

  // 1. Détecteurs purs : pas de LLM, pas de mtime
  const detectors = detectorRegistry.defaultDetectors();
  assert.equal(detectors.length, 8);

  // 2. Investigation bout-en-bout avec vrai ledger
  const ledger = new HypothesisLedger();
  const first = await investigator.investigate(db, {
    territoryId: 'territory.inv-test',
    rootPath: root,
    ledger,
    daemonId: 'daemon.resident-1'
  });
  assert.equal(first.investigated, true);
  const kinds = first.observations.map((o) => o.detectorId).sort();
  assert.ok(kinds.includes('test-regression'));
  assert.ok(kinds.includes('flaky-signal'));
  assert.ok(kinds.includes('broken-import'));
  assert.ok(kinds.includes('missing-sibling-test'));
  assert.ok(!first.observations.some((o) => o.scope.value === 'covered.js'));
  assert.ok(first.findings.every((f) => f && f.status === 'HYPOTHESIZED'));
  assert.ok(first.proposals.every((p) => p.proposed));

  // 3. Même observation ≠ preuve indépendante : second run, zéro doublon
  const findingsBefore = await findingService.listFindings(db, { territoryId: 'territory.inv-test' });
  const second = await investigator.investigate(db, { territoryId: 'territory.inv-test', rootPath: root, ledger });
  assert.equal(second.investigated, true);
  const findingsAfter = await findingService.listFindings(db, { territoryId: 'territory.inv-test' });
  assert.equal(findingsAfter.length, findingsBefore.length);

  // 4. Territoire inconnu : échec doux
  const ghost = await investigator.investigate(db, { territoryId: 'territory.ghost', rootPath: root });
  assert.equal(ghost.investigated, false);

  fs.rmSync(root, { recursive: true, force: true });
  await db.close();
  console.log(`Daemon investigator tests passed (${first.observations.length} observations, no duplicates, ledger linked).`);
}

main().catch((error) => { console.error(error); process.exit(1); });
