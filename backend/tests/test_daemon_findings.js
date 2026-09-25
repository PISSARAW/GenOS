'use strict';

const assert = require('node:assert/strict');
const findingService = require('../src/services/daemon/findings/findingService');
const evidenceService = require('../src/services/daemon/findings/findingEvidenceService');
const lifecycle = require('../src/services/daemon/findings/findingLifecycleService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');

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

function baseFinding(id) {
  return {
    id,
    territoryId: 'territory.findings-test',
    claim: 'auth middleware may bypass contract check on refresh path',
    scope: { type: 'file', value: 'backend/src/auth/middleware.js' },
    headSha: HEAD_A,
    createdBy: 'daemon.resident-1',
    limitations: ['not causally verified']
  };
}

async function main() {
  // 1. Lifecycle : transitions fermées, terminaux absorbants
  assert.equal(lifecycle.canTransition('OBSERVED', 'HYPOTHESIZED'), true);
  assert.equal(lifecycle.canTransition('OBSERVED', 'REPAIRABLE'), false);
  assert.equal(lifecycle.canTransition('REFUTED', 'HYPOTHESIZED'), false);
  assert.equal(lifecycle.isTerminal('REFUTED'), true);
  assert.equal(lifecycle.isTerminal('SUPPORTED'), false);

  const db = await openDb();
  await territoryService.createTerritory(db, {
    id: 'territory.findings-test', organizationId: 'org-1', projectId: 'project-1',
    workspaceId: 'workspace-1', repoIdentity: 'findings-test', rootPath: '/tmp/findings-test',
    headSha: HEAD_A, state: 'ACTIVE'
  });

  // 2. Création + validation (limitations obligatoires)
  const created = await findingService.createFinding(db, baseFinding('finding.auth-drift-001'));
  assert.equal(created.found, true);
  assert.equal(created.finding.status, 'OBSERVED');
  const noLimits = await findingService.createFinding(db, { ...baseFinding('finding.bad-001'), limitations: [] });
  assert.equal(noLimits.created, false);
  assert.ok(noLimits.errors.includes('limitations-required'));

  // 3. Montée épistémique complète jusqu'à REPAIRABLE
  const path = ['HYPOTHESIZED', 'SUPPORTED', 'REPRODUCED', 'CAUSALLY_SUPPORTED', 'REPAIRABLE'];
  for (const toStatus of path) {
    const moved = await findingService.transitionFinding(db, { id: 'finding.auth-drift-001', toStatus });
    assert.equal(moved.finding.status, toStatus);
  }

  // 4. Saut interdit rejeté
  const jump = await findingService.createFinding(db, baseFinding('finding.jump-001'));
  assert.equal(jump.finding.status, 'OBSERVED');
  const badJump = await findingService.transitionFinding(db, { id: 'finding.jump-001', toStatus: 'REPAIRABLE' });
  assert.equal(badJump.transitioned, false);

  // 5. Réfuté reste réfuté, même face au STALE de HEAD
  await findingService.transitionFinding(db, { id: 'finding.jump-001', toStatus: 'HYPOTHESIZED' });
  await findingService.transitionFinding(db, { id: 'finding.jump-001', toStatus: 'REFUTED' });
  const staleMove = await findingService.markStaleOnHead(db, { territoryId: 'territory.findings-test', headSha: HEAD_B });
  assert.ok(staleMove.marked >= 0);
  const refuted = await findingService.getFinding(db, { id: 'finding.jump-001' });
  assert.equal(refuted.finding.status, 'REFUTED');
  const noReturn = await findingService.transitionFinding(db, { id: 'finding.jump-001', toStatus: 'HYPOTHESIZED' });
  assert.equal(noReturn.transitioned, false);

  // 6. HEAD bougé → vivants en STALE, puis re-hypothèse sur nouveau HEAD
  await findingService.createFinding(db, baseFinding('finding.stale-001'));
  const marked = await findingService.markStaleOnHead(db, { territoryId: 'territory.findings-test', headSha: HEAD_B });
  assert.ok(marked.marked >= 1);
  await territoryService.updateHead(db, { id: 'territory.findings-test', headSha: HEAD_B });
  const staleOne = await findingService.getFinding(db, { id: 'finding.stale-001' });
  assert.equal(staleOne.finding.status, 'STALE');
  const staleHead = await findingService.transitionFinding(db, {
    id: 'finding.stale-001', toStatus: 'HYPOTHESIZED', headSha: HEAD_A
  });
  assert.equal(staleHead.transitioned, false);
  assert.ok(staleHead.errors.includes('revalidation-head-not-current'));
  const rehyp = await findingService.transitionFinding(db, { id: 'finding.stale-001', toStatus: 'HYPOTHESIZED', headSha: HEAD_B });
  assert.equal(rehyp.finding.status, 'HYPOTHESIZED');
  assert.equal(rehyp.finding.headSha, HEAD_B);

  // 7. Preuve typée des deux côtés, avec provenance obligatoire
  const sup = await evidenceService.appendEvidence(db, {
    findingId: 'finding.stale-001', side: 'supporting', evidenceType: 'observational',
    description: 'test failure observed on CI run 42', provenanceRecordId: 'prov-42'
  });
  assert.equal(sup.appended, true);
  const con = await evidenceService.appendEvidence(db, {
    findingId: 'finding.stale-001', side: 'contradicting', evidenceType: 'experimental',
    description: 'control run passes without the suspected cause', provenanceRecordId: 'prov-43'
  });
  assert.equal(con.appended, true);
  const noProv = await evidenceService.appendEvidence(db, {
    findingId: 'finding.stale-001', side: 'supporting', evidenceType: 'causal', description: 'x'
  });
  assert.equal(noProv.appended, false);
  const listed = await evidenceService.listEvidence(db, { findingId: 'finding.stale-001' });
  assert.equal(listed.supporting.length, 1);
  assert.equal(listed.contradicting.length, 1);

  // 8. Liste filtrée par statut
  const supported = await findingService.listFindings(db, { territoryId: 'territory.findings-test', status: 'HYPOTHESIZED' });
  assert.ok(supported.length >= 1);
  assert.ok(supported.every((f) => f.status === 'HYPOTHESIZED'));

  await db.close();
  console.log('Daemon findings tests passed (lifecycle, staleness, refuted-terminal, typed evidence).');
}

main().catch((error) => { console.error(error); process.exit(1); });
