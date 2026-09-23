'use strict';

const assert = require('node:assert/strict');
const feedback = require('../src/services/daemon/handoff/handoffFeedbackService');
const compiler = require('../src/services/daemon/handoff/handoffCompilerService');
const territoryService = require('../src/services/daemon/daemonTerritoryService');

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
  await territoryService.createTerritory(db, {
    id: 'territory.feedback-test',
    organizationId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    repoIdentity: 'feedback-test',
    rootPath: '/tmp/feedback-test',
    scopePath: '/',
    ref: 'main',
    headSha: HEAD_A,
    state: 'ACTIVE'
  });
  const compiled = await compiler.compileBrief(db, { territoryId: 'territory.feedback-test', mission: 'probe' });
  const briefId = compiled.brief.briefId;

  // 1. Verdicts valides persistés, invalides rejetés
  assert.equal((await feedback.recordFeedback(db, { briefId, findingId: 'finding.ignored', verdict: 'IRRELEVANT' })).recorded, true);
  assert.equal((await feedback.recordFeedback(db, { briefId, findingId: 'finding.ignored', verdict: 'BOGUS' })).recorded, false);
  assert.equal((await feedback.recordFeedback(db, { briefId: 'brief-ghost', findingId: 'finding.x', verdict: 'USED' })).recorded, false);

  // 2. Présenté 8 fois, jamais utile → demote
  for (let i = 0; i < 7; i++) {
    await feedback.recordFeedback(db, { briefId, findingId: 'finding.ignored', verdict: i % 2 ? 'STALE' : 'IRRELEVANT' });
  }
  const ignoredCounts = await feedback.usefulness(db, { findingId: 'finding.ignored' });
  assert.equal(ignoredCounts.presentations, 8);
  const ignoredScore = feedback.relevanceScore(ignoredCounts);
  assert.equal(ignoredScore.demote, true);
  assert.ok(ignoredScore.score < 0);

  // 3. DECISIVE protège de la démotion et pèse double
  await feedback.recordFeedback(db, { briefId, findingId: 'finding.hero', verdict: 'DECISIVE' });
  for (let i = 0; i < 8; i++) {
    await feedback.recordFeedback(db, { briefId, findingId: 'finding.hero', verdict: 'IRRELEVANT' });
  }
  const heroScore = feedback.relevanceScore(await feedback.usefulness(db, { findingId: 'finding.hero' }));
  assert.equal(heroScore.demote, false);
  assert.ok(heroScore.decisiveRate > 0);

  // 4. WRONG pénalise double, sans feedback → neutre
  await feedback.recordFeedback(db, { briefId, findingId: 'finding.wrong', verdict: 'WRONG' });
  assert.ok(feedback.relevanceScore(await feedback.usefulness(db, { findingId: 'finding.wrong' })).score < 0);
  const fresh = feedback.relevanceScore(await feedback.usefulness(db, { findingId: 'finding.fresh' }));
  assert.deepEqual([fresh.score, fresh.presentations, fresh.demote], [0, 0, false]);

  // 5. Consommation du brief (cycle de vie pour le Reconciler D13)
  assert.equal((await feedback.markBriefConsumed(db, { briefId })).consumed, true);
  const fetched = await compiler.getBrief(db, { briefId });
  assert.equal(fetched.status, 'CONSUMED');

  await db.close();
  console.log('Daemon handoff feedback tests passed (verdicts, demotion, decisive protection).');
}

main().catch((error) => { console.error(error); process.exit(1); });
