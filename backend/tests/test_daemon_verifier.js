'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const verifier = require('../src/services/daemon/verification/verifierService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const bridgeService = require('../src/services/daemon/daemonEventBridgeService');
const findingService = require('../src/services/daemon/findings/findingService');
const evidenceService = require('../src/services/daemon/findings/findingEvidenceService');
const cartographer = require('../src/services/daemon/cartography/cartographerService');

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);

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

async function makeFinding(db, spec) {
  const created = await findingService.createFinding(db, {
    id: spec.id,
    territoryId: 'territory.ver-test',
    claim: `verifier probe claim for ${spec.scope} with enough words`,
    scope: { type: 'file', value: spec.scope },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    detectorId: spec.detector,
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  await db.run("UPDATE daemon_findings SET created_at = '2000-01-01T00:00:00Z' WHERE id = ?", spec.id);
  return created.finding;
}

async function main() {
  const db = await openDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ver-'));
  fs.writeFileSync(path.join(root, 'flaky-scope.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'gone.js'), 'module.exports = 2;\n');
  fs.writeFileSync(path.join(root, 'still-broken.js'), "const x = require('./nope');\nmodule.exports = x;\n");
  fs.writeFileSync(path.join(root, 'lonely-scope.js'), 'module.exports = 3;\n');

  await territoryService.createTerritory(db, {
    id: 'territory.ver-test',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'ver-test',
    rootPath: root,
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
  await cartographer.scanTerritory(db, { territoryId: 'territory.ver-test', rootPath: root, scopePath: '/' });
  const bridge = bridgeService.createBridge({ db });

  // 1. HEAD bougé → STALE + preuve annexée, jamais transport silencieux
  await makeFinding(db, { id: 'finding.ver-stale', detector: 'test-regression', scope: 'flaky-scope.js' });
  await territoryService.updateHead(db, { id: 'territory.ver-test', headSha: HEAD_B });
  const staleRes = await verifier.verifyFinding(db, { findingId: 'finding.ver-stale' });
  assert.equal(staleRes.verified, true);
  assert.equal(staleRes.transition, 'STALE');
  const staleEv = await evidenceService.listEvidence(db, { findingId: 'finding.ver-stale' });
  assert.ok(staleEv.supporting.length >= 1);
  await territoryService.updateHead(db, { id: 'territory.ver-test', headSha: HEAD_A });

  // 2. Scope disparu du graphe → EXPIRED
  await makeFinding(db, { id: 'finding.ver-gone', detector: 'test-regression', scope: 'gone.js' });
  fs.unlinkSync(path.join(root, 'gone.js'));
  await cartographer.updateFiles(db, { territoryId: 'territory.ver-test', rootPath: root, files: ['gone.js'] });
  const goneRes = await verifier.verifyFinding(db, { findingId: 'finding.ver-gone' });
  assert.equal(goneRes.transition, 'EXPIRED');

  // 3. test-regression + récupération postérieure → REFUTED
  await makeFinding(db, { id: 'finding.ver-refute', detector: 'test-regression', scope: 'flaky-scope.js' });
  await bridgeService.ingestEvent(bridge, { type: 'TEST_RECOVERED', territoryId: 'territory.ver-test', payload: { file: 'flaky-scope.js' } });
  const refuteRes = await verifier.verifyFinding(db, { findingId: 'finding.ver-refute' });
  assert.equal(refuteRes.transition, 'REFUTED');
  const refuted = await findingService.getFinding(db, { id: 'finding.ver-refute' });
  assert.equal(refuted.finding.status, 'REFUTED');

  // 4. Terminal : le verifier ne rouvre jamais
  const terminalRes = await verifier.verifyFinding(db, { findingId: 'finding.ver-refute' });
  assert.equal(terminalRes.verified, false);
  assert.equal(terminalRes.reason, 'terminal');

  // 5. test-regression + nouvel échec indépendant → SUPPORTED
  await makeFinding(db, { id: 'finding.ver-support', detector: 'test-regression', scope: 'lonely-scope.js' });
  await bridgeService.ingestEvent(bridge, { type: 'TEST_FAILED', territoryId: 'territory.ver-test', payload: { file: 'lonely-scope.js' } });
  const supportRes = await verifier.verifyFinding(db, { findingId: 'finding.ver-support' });
  assert.equal(supportRes.transition, 'SUPPORTED');

  // 6. broken-import toujours cassé → SUPPORTED ; réparé → REFUTED
  await makeFinding(db, { id: 'finding.ver-broken', detector: 'broken-import', scope: 'still-broken.js' });
  const brokenRes = await verifier.verifyFinding(db, { findingId: 'finding.ver-broken' });
  assert.equal(brokenRes.transition, 'SUPPORTED');
  fs.writeFileSync(path.join(root, 'still-broken.js'), 'module.exports = 1;\n');
  await makeFinding(db, { id: 'finding.ver-fixed', detector: 'broken-import', scope: 'still-broken.js' });
  const fixedRes = await verifier.verifyFinding(db, { findingId: 'finding.ver-fixed' });
  assert.equal(fixedRes.transition, 'REFUTED');

  // 7. missing-sibling-test + test apparu → REFUTED
  await makeFinding(db, { id: 'finding.ver-sibling', detector: 'missing-sibling-test', scope: 'lonely-scope.js' });
  fs.writeFileSync(path.join(root, 'lonely-scope.test.js'), 'it();\n');
  const siblingRes = await verifier.verifyFinding(db, { findingId: 'finding.ver-sibling' });
  assert.equal(siblingRes.transition, 'REFUTED');

  // 8. Finding inconnu : échec doux
  assert.equal((await verifier.verifyFinding(db, { findingId: 'finding.ghost' })).verified, false);

  fs.rmSync(root, { recursive: true, force: true });
  await db.close();
  console.log('Daemon verifier tests passed (stale, expired, refuted, supported, terminal).');
}

main().catch((error) => { console.error(error); process.exit(1); });
