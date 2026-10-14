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
  const scopeId = 'workspace:request-test-a';
  const expiry = registry.expiryFor(trivial.profile);
  const candidateInput = {
    scopeId,
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
  };
  await registry.storeCandidate(db, candidateInput);
  const hit = await registry.lookupReusable(db, { semanticId: trivial.semanticId, scopeId, dependencies: {} });
  check('reuse hit', hit.hit === true);
  check('reuse value 4', JSON.parse(hit.champion.content_json).value === 4);

  await db.run("UPDATE request_results SET status = 'PROVISIONAL' WHERE id = ?", hit.champion.id);
  const provisional = await registry.lookupReusable(db, { semanticId: trivial.semanticId, scopeId, dependencies: {} });
  check('provisional result is not reusable', provisional.hit === false && provisional.reason === 'status-not-reusable');
  await db.run("UPDATE request_results SET status = 'VERIFIED' WHERE id = ?", hit.champion.id);

  const provisionalId = (await registry.storeCandidate(db, {
    ...candidateInput, status: 'PROVISIONAL', contentJson: JSON.stringify({ value: 5 })
  })).id;
  const preserved = await registry.getChampion(db, trivial.semanticId, scopeId);
  check('provisional candidate does not replace verified champion', preserved.champion.id === hit.champion.id);
  check('provisional candidate does not supersede verified champion', preserved.champion.status === 'VERIFIED');
  await assert.rejects(
    () => registry.promoteChampion(db, { semanticId: trivial.semanticId, id: provisionalId, scopeId }),
    (error) => error.code === 'RESULT_PROMOTION_BLOCKED'
  );
  await db.run('UPDATE request_results SET dependencies_json = ? WHERE id = ?', JSON.stringify({ repo_head: 'abc', runtime: 'v1' }), hit.champion.id);
  const omittedDependencies = await registry.lookupReusable(db, { semanticId: trivial.semanticId, scopeId });
  check('missing dependency snapshot cannot reuse champion', omittedDependencies.hit === false && omittedDependencies.reason === 'dependencies-unavailable');
  check('missing dependency snapshot does not destroy champion', (await registry.getChampion(db, trivial.semanticId, scopeId)).champion.status === 'VERIFIED');
  const sameDependencies = await registry.lookupReusable(db, {
    semanticId: trivial.semanticId, scopeId, dependencies: { runtime: 'v1', repo_head: 'abc' }
  });
  check('same dependency snapshot remains reusable', sameDependencies.hit === true);
  const malformedDependencies = await registry.lookupReusable(db, { semanticId: trivial.semanticId, scopeId, dependencies: 'repo_head=abc' });
  check('malformed dependency snapshot cannot reuse champion', malformedDependencies.hit === false && malformedDependencies.reason === 'dependencies-invalid');
  const droppedDependency = await registry.lookupReusable(db, {
    semanticId: trivial.semanticId, scopeId, dependencies: { repo_head: 'abc' }
  });
  check('removed dependency invalidates champion', droppedDependency.hit === false && droppedDependency.reason === 'deps-changed');

  const foreignScope = 'workspace:request-test-b';
  const crossScope = await registry.lookupReusable(db, { semanticId: trivial.semanticId, scopeId: foreignScope, dependencies: {} });
  check('same semantic request cannot reuse another workspace result', crossScope.hit === false && !crossScope.champion);
  const foreignCandidate = await registry.storeCandidate(db, {
    ...candidateInput, scopeId: foreignScope, contentJson: JSON.stringify({ value: 99 })
  });
  const foreignChampion = await registry.getChampion(db, trivial.semanticId, foreignScope);
  check('each workspace gets its own champion', foreignChampion.champion.id === foreignCandidate.id);
  check('original workspace champion remains isolated', (await registry.getChampion(db, trivial.semanticId, scopeId)).champion.status === 'STALE');
  await db.close();
  console.log('request-memory routing: all assertions passed');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
