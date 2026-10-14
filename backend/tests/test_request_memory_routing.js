'use strict';

const assert = require('assert');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'request-memory-test-secret';
const profiler = require('../src/services/requestProfilerService');
const router = require('../src/services/executionRouterService');
const registry = require('../src/services/bestKnownResultService');
const verifierTrust = require('../src/services/verifierTrustRegistry');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');

function check(name, cond) {
  assert.ok(cond, name);
  console.log(`ok - ${name}`);
}

function signedCandidate(input, independent = true) {
  return {
    ...input,
    verificationReceipt: issueReceipt({
      resultId: input.semanticId,
      evidenceDigest: registry.candidateEvidenceDigest(input),
      verifierDigest: verifierTrust.resolveVerifierDigest({ type: 'test' }),
      status: 'verified',
      independent,
    }),
  };
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
  const candidateInput = signedCandidate({
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
  });
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
  await assert.rejects(() => registry.storeCandidate(db, {
    ...candidateInput, semanticId: 'unverified-cache-result', verificationReceipt: undefined
  }), (error) => error.code === 'RESULT_VERIFICATION_REQUIRED');
  const noReceipt = await db.get("SELECT COUNT(*) AS count FROM request_problems WHERE normalized_intent = '2+2'");
  check('verified status without receipt is rejected', noReceipt.count === 1);
  const nonIndependent = signedCandidate({ ...candidateInput, semanticId: 'dependent-cache-result' }, false);
  await assert.rejects(() => registry.storeCandidate(db, nonIndependent), (error) => error.code === 'RESULT_VERIFICATION_REQUIRED');
  const noDependent = await db.get("SELECT COUNT(*) AS count FROM request_problems WHERE normalized_intent = '2+2'");
  check('dependent verifier receipt is rejected', noDependent.count === 1);
  const tampered = signedCandidate({ ...candidateInput, semanticId: 'tampered-cache-result' });
  tampered.verificationReceipt.signature = '0'.repeat(64);
  await assert.rejects(() => registry.storeCandidate(db, tampered), (error) => error.code === 'RESULT_VERIFICATION_REQUIRED');
  const noTampered = await db.get("SELECT COUNT(*) AS count FROM request_problems WHERE normalized_intent = '2+2'");
  check('tampered verifier receipt is rejected', noTampered.count === 1);

  await db.exec("CREATE TRIGGER fail_request_result_insert BEFORE INSERT ON request_results BEGIN SELECT RAISE(ABORT, 'injected result failure'); END;");
  const failedInput = signedCandidate({
    ...candidateInput, semanticId: 'atomic-insert-failure', normalizedIntent: 'atomic insert failure'
  });
  await assert.rejects(() => registry.storeCandidate(db, failedInput));
  await db.exec('DROP TRIGGER fail_request_result_insert;');
  const orphanCount = await db.get("SELECT COUNT(*) AS count FROM request_problems WHERE normalized_intent = 'atomic insert failure'");
  check('failed candidate insert leaves no orphan problem', orphanCount.count === 0);

  const replacementInput = signedCandidate({ ...candidateInput, promote: false, contentJson: JSON.stringify({ value: 6 }) });
  const replacement = await registry.storeCandidate(db, replacementInput);
  await db.exec("CREATE TRIGGER fail_champion_update BEFORE UPDATE ON request_problems BEGIN SELECT RAISE(ABORT, 'injected champion failure'); END;");
  await assert.rejects(() => registry.promoteChampion(db, { semanticId: trivial.semanticId, id: replacement.id, scopeId }));
  await db.exec('DROP TRIGGER fail_champion_update;');
  const preservedAfterFailure = await registry.getChampion(db, trivial.semanticId, scopeId);
  check('failed pointer update preserves current champion pointer', preservedAfterFailure.champion.id === hit.champion.id);
  check('failed pointer update preserves current champion status', preservedAfterFailure.champion.status === 'VERIFIED');

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
  const foreignInput = signedCandidate({ ...candidateInput, scopeId: foreignScope, contentJson: JSON.stringify({ value: 99 }) });
  const foreignCandidate = await registry.storeCandidate(db, foreignInput);
  const foreignChampion = await registry.getChampion(db, trivial.semanticId, foreignScope);
  check('each workspace gets its own champion', foreignChampion.champion.id === foreignCandidate.id);
  check('original workspace champion remains isolated', (await registry.getChampion(db, trivial.semanticId, scopeId)).champion.status === 'STALE');
  const rejectedForeignRefute = await registry.refuteResult(db, {
    id: foreignCandidate.id, semanticId: trivial.semanticId, scopeId
  });
  check('workspace cannot refute another workspace result', rejectedForeignRefute === false);
  check('foreign champion survives out-of-scope refutation', (await registry.getChampion(db, trivial.semanticId, foreignScope)).champion.status === 'VERIFIED');
  const refuted = await registry.refuteResult(db, {
    id: foreignCandidate.id, semanticId: trivial.semanticId, scopeId: foreignScope
  });
  check('same-workspace refutation is applied', refuted === true);
  const refutedProblem = await registry.getChampion(db, trivial.semanticId, foreignScope);
  check('refutation clears champion pointer', refutedProblem.champion === null);
  await assert.rejects(() => registry.refuteResult(db, { id: foreignCandidate.id, semanticId: trivial.semanticId }),
    (error) => error.code === 'RESULT_SCOPE_REQUIRED');
  await db.close();
  console.log('request-memory routing: all assertions passed');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
