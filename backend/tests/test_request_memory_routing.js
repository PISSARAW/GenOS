'use strict';

const assert = require('assert');
const profiler = require('../src/services/requestProfilerService');
const router = require('../src/services/executionRouterService');
const registry = require('../src/services/bestKnownResultService');

function check(name, cond) {
  assert.ok(cond, name);
  console.log(`ok - ${name}`);
}

async function memoryDb() {
  const sqlite3 = require('sqlite3').verbose();
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await registry.ensureTables(db);
  return db;
}

async function main() {
  const trivial = profiler.profileRequest({ mission: '2+2' });
  check('2+2 class', trivial.profile.request_class === 'deterministic_trivial');
  const routeTrivial = router.chooseExecutionPath(trivial.profile);
  check('2+2 primitive', routeTrivial.mode === 'primitive');
  const prim = router.tryArithmeticPrimitive(trivial.normalized.text);
  check('2+2 evals 4', prim && prim.value === 4);

  const repo = profiler.profileRequest({ mission: 'explique-moi ce repo' });
  check('repo class', repo.profile.request_class === 'repo_understanding');
  const routeRepo = router.chooseExecutionPath(repo.profile);
  check('repo needs worker', router.needsOrchestration(routeRepo.mode) === true);

  const conway = profiler.profileRequest({ mission: 'Conway 99 combinatoire difficile' });
  check('conway large search', router.chooseExecutionPath(conway.profile).mode === 'large_search');

  const db = await memoryDb();
  const expiry = registry.expiryFor(trivial.profile);
  await registry.storeCandidate(db, {
    semanticId: trivial.semanticId,
    normalizedIntent: trivial.normalized.text,
    requestClass: trivial.profile.request_class,
    profileJson: JSON.stringify(trivial.profile),
    status: 'VERIFIED',
    contentJson: JSON.stringify({ value: 4 }),
    evidenceJson: '[]',
    uncertaintyJson: '{}',
    dependenciesJson: '{}',
    executionJson: '{}',
    validityHorizonMs: expiry.horizonMs,
    expiresAt: expiry.expiresAt,
    utility: 1.0,
    costJson: '{}',
    supersedes: null,
  });
  const hit = await registry.lookupReusable(db, { semanticId: trivial.semanticId, dependencies: {} });
  check('reuse hit', hit.hit === true);
  check('reuse value 4', JSON.parse(hit.champion.content_json).value === 4);

  const stale = await registry.lookupReusable(db, { semanticId: trivial.semanticId, dependencies: { repo_head: 'xyz' } });
  check('deps change invalidates', stale.hit === false);
  await db.close();
  console.log('request-memory routing: all assertions passed');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
