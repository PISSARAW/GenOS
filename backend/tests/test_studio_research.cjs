'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixture = require('./helpers/b06ClientFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function protocols(spec) {
  const body = { title: 'Protocole falsifiable', workspaceId: 'consumer-ws', seed: 7,
    protocol: { question: 'La sortie est-elle exacte ?', falsification: 'Une sortie différente réfute l’hypothèse.' },
    inputs: { output: 'preuve' }, budget: { tokens: 100, costUsd: 0, durationMs: 1000, maxTrials: 1 }, environment: { platform: process.platform } };
  const registered = await request(spec, '/api/experiments/register-protocol', { body });
  assert.equal(registered.status, 201, JSON.stringify(registered.value));
  assert.equal(registered.value.executionStarted, false);
  const id = registered.value.experimentId;
  const base = '/api/experiments/' + id;
  const ledger = base + '/evidence-ledger';
  const claim = await request(spec, ledger + '/claims', { body: { statement: 'La sortie vaut preuve', scope: {}, assumptions: [] } });
  assert.equal(claim.status, 201);
  const claimId = claim.value.claim.claimId;
  for (const relation of ['SUPPORTS', 'CONTRADICTS']) {
    assert.equal((await request(spec, ledger + '/claims/' + claimId + '/evidence',
      { body: { relation, sourceKind: 'artifact', sourceId: 'isolated-test', evidence: { observation: relation } } })).status, 201);
  }
  const inspected = await request(spec, ledger);
  assert.equal(inspected.value.protocol.seed, 7);
  assert.equal(inspected.value.protocol.budget.tokens, 100);
  assert.equal(inspected.value.claims[0].status.position, 'SUPPORTED_WITH_DISSENT');
  assert.equal(inspected.value.claims[0].status.promotionEligible, false);
  assert.equal((await request(spec, ledger, { project: 'b06-other' })).status, 404);
  const replay = await request(spec, base + '/replay-inputs', { body: {} });
  assert.equal(replay.status, 201);
  assert.equal(replay.value.protocol.inputsHash, inspected.value.protocol.inputsHash);
  assert.equal(replay.value.protocol.replaySource.experimentId, id);
  const wrongClaim = await request(spec, '/api/experiments/' + replay.value.experimentId + '/evidence-ledger/claims/' + claimId + '/assessments',
    { body: { kind: 'consensus', position: 'support', rationale: 'cross experiment' } });
  assert.equal(wrongClaim.status, 404);
  assert.equal((await request(spec, '/api/experiments/register-protocol', { body: { ...body, budget: { ...body.budget, tokens: -1 } } })).status, 400);
  const before = (await spec.db.get('SELECT COUNT(*) AS n FROM experiments')).n;
  assert.equal((await request(spec, '/api/experiments/register-protocol', { body: { ...body, proofLevel: 'L0' } })).status, 400);
  assert.equal((await request(spec, '/api/experiments/register-protocol', { body: { ...body, topologyRefs: ['UNKNOWN_TOPOLOGY'] } })).status, 400);
  assert.equal((await spec.db.get('SELECT COUNT(*) AS n FROM experiments')).n, before);
}

async function evaluations(spec) {
  const dataset = await request(spec, '/api/evals/datasets', { body: { name: 'Exact recorded inputs' } });
  assert.equal(dataset.status, 201);
  const caseResult = await request(spec, '/api/evals/datasets/' + dataset.value.id + '/cases',
    { body: { input: { output: 'exact' }, expected: 'exact', labels: [] } });
  assert.equal(caseResult.status, 201);
  const job = await request(spec, '/api/evals/jobs', { body: { datasetId: dataset.value.id, config: { graders: ['exact_match'], seed: 7 } } });
  assert.equal(job.status, 201, JSON.stringify(job.value));
  await spec.db.run('UPDATE dataset_cases SET input_json=? WHERE id=?', '{"output":"modified later"}', caseResult.value.id);
  await require('../src/services/jobWorker').processOnce();
  const completed = await request(spec, '/api/evals/jobs/' + job.value.id);
  assert.equal(completed.value.status, 'completed', JSON.stringify(completed.value));
  assert.equal(completed.value.result.passed, 1);
  assert.equal(completed.value.result.cases[0].source, 'fixture');
  const replay = await request(spec, '/api/evals/jobs/' + job.value.id + '/replay', { body: {} });
  assert.equal(replay.status, 201);
  assert.equal(replay.value.sourceJobId, job.value.id);
  const comparison = await request(spec, '/api/evals/compare?ids=' + job.value.id + ',' + replay.value.id);
  assert.equal(comparison.status, 200);
  assert.equal(comparison.value.sameCapturedInputs, true);
  assert.equal((await request(spec, '/api/evals/jobs/' + job.value.id + '/replay', { project: 'b06-other', body: {} })).status, 404);
  assert.equal((await request(spec, '/api/evals/compare?ids=' + job.value.id + ',' + replay.value.id, { project: 'b06-other' })).status, 404);
  assert.equal((await request(spec, '/api/evals/jobs/' + replay.value.id + '/cancel', { body: {} })).value.status, 'cancelled');
  await require('../src/services/jobWorker').processOnce();
  assert.equal((await request(spec, '/api/evals/jobs/' + replay.value.id)).value.status, 'cancelled');
  await spec.db.run('UPDATE evaluation_job_inputs SET cases_json=? WHERE job_id=?', '[]', job.value.id);
  assert.equal((await request(spec, '/api/evals/jobs/' + job.value.id + '/replay', { body: {} })).status, 409);
}

async function arenas(spec) {
  const own = await request(spec, '/api/arena/run', { body: { problemSpec: { title: 'OWN_ARENA', cases: [{ values: [1, 2, 3], target: 2 }] },
    solvers: ['beam_solver'], rounds: 1 } });
  assert.equal(own.status, 200);
  const other = await request(spec, '/api/arena/run', { project: 'b06-other', body: { problemSpec: { title: 'OTHER_ARENA', cases: [{ values: [10, 20, 30], target: 20 }] },
    solvers: ['react_solver'], rounds: 1 } });
  assert.equal(other.status, 200);
  const ownTrace = await request(spec, '/api/arena/trace?tournamentId=' + own.value.tournamentId);
  assert.equal(ownTrace.status, 200);
  assert.match(ownTrace.value.traceId, new RegExp(own.value.tournamentId));
  assert.equal((await request(spec, '/api/arena/trace?tournamentId=' + other.value.tournamentId)).status, 404);
  assert.equal((await request(spec, '/api/arena/pareto')).status, 200);
}

async function main() {
  const spec = await fixture.prepare();
  const server = require('../src/app').createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  spec.url = `http://127.0.0.1:${server.address().port}`;
  try {
    await protocols(spec);
    await evaluations(spec);
    await arenas(spec);
    console.log('Studio research: atomic protocols, dissent without promotion, scoped claims, frozen inputs executed, replay/cancel/hash refusal and private arena traces passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await require('../src/db').closeDatabase();
    fs.rmSync(spec.root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
