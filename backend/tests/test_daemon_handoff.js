'use strict';

const assert = require('node:assert/strict');
const compiler = require('../src/services/daemon/handoff/handoffCompilerService');
const relevance = require('../src/services/daemon/handoff/handoffRelevanceService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const findingService = require('../src/services/daemon/findings/findingService');
const cartographer = require('../src/services/daemon/cartography/cartographerService');
const stigmergy = require('../src/services/daemon/daemonStigmergyService');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
  // 1. Pertinence : statut d'abord, mission ensuite
  const fSupported = { status: 'SUPPORTED', claim: 'unrelated drift', scope_value: 'x.js', detector_id: 'd' };
  const fHypo = { status: 'HYPOTHESIZED', claim: 'auth middleware bypass', scope_value: 'backend/auth/mw.js', detector_id: 'd' };
  assert.ok(relevance.scoreFinding(fSupported, {}) > relevance.scoreFinding(fHypo, {}));
  assert.ok(relevance.scoreFinding(fHypo, { mission: 'fix auth middleware' }) > relevance.scoreFinding(fHypo, {}));
  assert.equal(relevance.relevanceClass([]), 'low');
  assert.equal(relevance.relevanceClass([{ score: 7 }]), 'high');

  const db = await openDb();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-handoff-'));
  fs.writeFileSync(path.join(root, 'auth.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'auth.test.js'), 'it();\n');

  await territoryService.createTerritory(db, {
    id: 'territory.handoff-test',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'handoff-test',
    rootPath: root,
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
  await cartographer.scanTerritory(db, { territoryId: 'territory.handoff-test', rootPath: root, scopePath: '/' });
  await findingService.createFinding(db, {
    id: 'finding.handoff-open',
    territoryId: 'territory.handoff-test',
    claim: 'auth module may violate invariant around token refresh flow',
    scope: { type: 'file', value: 'auth.js' },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    createdBy: 'daemon.resident-1',
    limitations: ['not causally verified']
  });
  await findingService.transitionFinding(db, { id: 'finding.handoff-open', toStatus: 'SUPPORTED' });
  await findingService.createFinding(db, {
    id: 'finding.handoff-dead',
    territoryId: 'territory.handoff-test',
    claim: 'dead hypothesis about auth with enough words here',
    scope: { type: 'file', value: 'auth.js' },
    headSha: HEAD_A,
    status: 'HYPOTHESIZED',
    createdBy: 'daemon.resident-1',
    limitations: ['probe']
  });
  await findingService.transitionFinding(db, { id: 'finding.handoff-dead', toStatus: 'REFUTED' });
  await stigmergy.depositMarker(db, { territoryId: 'territory.handoff-test', scope: 'auth.js', kind: 'TEST_INSTABILITY', intensity: 3 });

  // 2. Brief orienté mission : finding pertinent d'abord, dead end listé, tests présents
  const res = await compiler.compileBrief(db, { territoryId: 'territory.handoff-test', mission: 'fix auth token refresh' });
  assert.equal(res.compiled, true);
  assert.equal(res.brief.findings[0].id, 'finding.handoff-open');
  assert.equal(res.brief.deadEnds.length, 1);
  assert.ok(res.brief.tests.includes('auth.test.js'));
  assert.equal(res.brief.attention[0].scope, 'auth.js');
  assert.ok(res.brief.summary.files >= 2);

  // 3. Signal zero-text : pas de dossier dans le signal
  assert.equal(res.signal.semanticType, 'TERRITORY_BRIEF_READY');
  assert.equal(res.signal.briefId, res.brief.briefId);
  assert.ok(!('findings' in res.signal) && !('claim' in res.signal));

  // 4. Récupération explicite du dossier
  const fetched = await compiler.getBrief(db, { briefId: res.brief.briefId });
  assert.equal(fetched.found, true);
  assert.equal(fetched.brief.briefId, res.brief.briefId);

  // 5. Territoire vide : brief gracieux, relevance low
  await territoryService.createTerritory(db, {
    id: 'territory.handoff-empty',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'empty',
    rootPath: root,
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
  const empty = await compiler.compileBrief(db, { territoryId: 'territory.handoff-empty' });
  assert.equal(empty.compiled, true);
  assert.equal(empty.brief.relevanceClass, 'low');
  assert.equal(empty.brief.findings.length, 0);

  // 6. Territoire inconnu : échec doux
  assert.equal((await compiler.compileBrief(db, { territoryId: 'territory.ghost' })).compiled, false);

  fs.rmSync(root, { recursive: true, force: true });
  await db.close();
  console.log('Daemon handoff tests passed (mission ranking, zero-text signal, on-demand brief).');
}

main().catch((error) => { console.error(error); process.exit(1); });
