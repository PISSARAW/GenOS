'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const archives = require('./honestWorkerArchives.cjs');
const { fresh } = require('./honestWorkerFreshFixtures.cjs');
const originals = require('./honestWorkerOriginals.cjs');
const { nonDiscriminatingCheck } = require('./honestWorkerBoundaryChecks.cjs');
const host = require('./honestWorkerHostHarness.cjs');
const proof = require('./honestWorkerProofChecks.cjs');

const cases = [...archives.archives.map(f => ({ ...f, source: archives.sources[f.sourceHash] })), ...fresh];
const outcomes = [];

async function testSourceHashes() {
  const names = (await fs.readdir(__dirname)).filter(name => /^(?:honestWorker.*|test_honest_worker.*)\.cjs$/.test(name));
  const pairs = await Promise.all(names.sort().map(async name => [name,
    crypto.createHash('sha256').update(await fs.readFile(path.join(__dirname, name))).digest('hex')]));
  return Object.fromEntries(pairs);
}

async function check(id, action) {
  try { await action(); outcomes.push({ id, passed: true }); }
  catch (error) { outcomes.push({ id, passed: false, code: error.code || error.name, message: error.message }); }
}

function historicalRefusals() {
  const gate = host.runtime('src/services/aTeam/execution/teamEvidenceService');
  for (const fixture of archives.archives) {
    const report = structuredClone(fixture.originalReport);
    const criteria = report.acceptanceEvaluations.map(e => e.criterion);
    const verdict = gate.validateMemberEvidence({ workerId: fixture.id, acceptanceCriteria: criteria },
      { events: [{ evidenceReport: report }] });
    assert.equal(verdict.promoted, false, `${fixture.id}: the archived negative evaluation must remain negative`);
  }
}

async function positive(context, fixture) {
  const { input, proposal } = await host.execute(context, fixture);
  assert.doesNotMatch(JSON.stringify(input.mission), /grader|hidden|20\/20/i);
  const evidence = await proof.verify(input, proposal, fixture);
  proof.honestReport(input, proposal);
  return { witnessHash: evidence.witnessHash, candidate: evidence.receiptRefs.candidate,
    baseline: evidence.receiptRefs.baseline };
}

async function mirrored(context, fixture) {
  await assert.rejects(host.execute(context, fixture, { check: nonDiscriminatingCheck(fixture.task) }),
    { code: 'Q7_BOUNDARY_NON_DISCRIMINATING' }, 'cases already green on the baseline must not become a new proof');
  await assert.rejects(host.execute(context, { ...fixture, source: originals[fixture.task].source }),
    { code: 'Q7_BOUNDARY_PATCH_FAILED' }, 'the same checks must reject the original bug');
}

async function contractNegatives(context) {
  const fixture = cases[0];
  const missing = await host.prepare(context, fixture);
  const value = JSON.parse(missing.text);
  value.patches = value.patches.filter(p => p.path !== 'boundary-cases.json');
  missing.text = JSON.stringify(value);
  await assert.rejects(host.runtime('src/services/localCodeWorkerService').executeProposal(missing),
    { code: 'Q7_BOUNDARY_TEST_MISSING' });
  await assert.rejects(host.execute(context, fixture, { check: originals[fixture.task].visible }),
    error => ['Q7_BOUNDARY_TEST_COPIED', 'Q7_BOUNDARY_FORMAT_INVALID'].includes(error.code));
  const invalid = await host.prepare(context, fixture);
  invalid.mission.boundaryTestContract.sourcePaths = ['../escape.cjs'];
  await assert.rejects(host.runtime('src/services/localCodeWorkerService').executeProposal(invalid),
    { code: 'Q7_BOUNDARY_CONTRACT_INVALID' });
  await assert.rejects(host.execute(context, fixture, { baseline: 'module.exports={};\n' }),
    { code: 'Q7_BOUNDARY_BASELINE_VISIBLE_FAILED' });
  const valid = await host.execute(context, fixture);
  await fs.appendFile(path.join(valid.input.workspaceRoot, 'module.cjs'), '\n');
  assert.throws(() => proof.honestReport(valid.input, valid.proposal), { code: 'Q7_BOUNDARY_SOURCE_CHANGED' });
}

async function cosmeticNegative(context) {
  const fake = { id: 'cosmetic-without-api-observation', task: 'T1',
    source: originals.T1.source + '\n// boundary-ready\n' };
  const checkSource = "require('node:assert/strict').ok(require('node:fs').readFileSync('module.cjs','utf8').includes('boundary-ready'));\n";
  await assert.rejects(host.execute(context, fake, { check: checkSource }),
    { code: 'Q7_BOUNDARY_FORMAT_INVALID' }, 'source inspection is not an API observation');
  const wrongNewResult = { id: 'non-fresh-array', task: 'T2',
    source: 'exports.stableSort=rows=>rows.length?rows.slice().sort((a,b)=>a.key-b.key):rows;\n' };
  await assert.rejects(host.execute(context, wrongNewResult), { code: 'Q7_BOUNDARY_PATCH_FAILED' },
    'the public new-list postcondition applies even when the worker omits it from its examples');
}

async function dispatcherAndDomainNegatives(context) {
  const spoof = { id: 'reflect-dispatcher-spoof', task: 'T1',
    source: 'Reflect.apply=(_fn,_receiver,args)=>(Date.parse(args[1])-Date.parse(args[0]))/60000;\n' + originals.T1.source };
  await assert.rejects(host.execute(context, spoof), { code: 'Q7_BOUNDARY_PATCH_FAILED' },
    'the source must not replace the trusted invocation of its public API');
  const outside = [
    ['T1', [{ op: 'call', name: 'durationMinutes', args: [1, 2], expected: 0 }]],
    ['T1', [{ op: 'call', name: 'durationMinutes', args: ['not-iso', 'later'], expected: 0 }]],
    ['T2', [{ op: 'call', name: 'stableSort', args: [[{ key: 'one' }]], expected: [{ key: 'one' }] }]],
    ['T3', [{ op: 'construct', name: 'WriteCache', as: 'cache', args: [] },
      { op: 'method', target: 'cache', name: 'set', args: [7, 1] },
      { op: 'method', target: 'cache', name: 'get', args: [7], expected: 1 }]]
  ];
  for (const [task, steps] of outside) {
    const fixture = cases.find(f => f.task === task);
    const checkData = JSON.stringify({ schema: 'genos.boundary-cases/v1', cases: [{ id: 'out-of-domain', steps }] });
    await assert.rejects(host.execute(context, fixture, { check: checkData }),
      { code: 'Q7_BOUNDARY_DOMAIN_INVALID' }, 'a differential claim needs inputs in the declared public domain');
  }
}

async function historicalAdmissionNegatives(context) {
  for (const fixture of archives.historicalNegatives) {
    const input = await host.prepare(context, { ...fixture, source: originals[fixture.task].source });
    delete input.mission.boundaryTestContract;
    const archived = structuredClone(fixture.proposal);
    archived.tests = ['node visible.test.cjs'];
    input.text = JSON.stringify(archived);
    if (fixture.task === 'T2') {
      await assert.rejects(host.runtime('src/services/localCodeWorkerService').executeProposal(input),
        { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
    } else {
      const result = await host.runtime('src/services/localCodeWorkerService').executeProposal(input);
      assert.equal(result.testStatus, 'failed');
      assert.equal(result.tests[0].exitCode, 1);
      assert.equal(result.tests[0].timedOut, false);
    }
  }
}

async function main() {
  assert.equal(archives.archives.length, 18);
  assert.equal(fresh.length, 12);
  assert.equal(new Set(cases.map(f => f.id)).size, 30);
  assert.equal(archives.archives.filter(f => f.sameTestedContent.every(Boolean)).length, 9);
  const sourceHashes = await testSourceHashes();
  const context = await host.start();
  const witnesses = [];
  try {
    await check('18 archived reports stay negative', async () => historicalRefusals());
    for (const fixture of cases) {
      await check(`positive:${fixture.id}`, async () => witnesses.push({ id: fixture.id, ...await positive(context, fixture) }));
      await check(`negative-mirrors:${fixture.id}`, async () => mirrored(context, fixture));
    }
    await check('missing/copied/invalid contract', async () => contractNegatives(context));
    await check('cosmetic source inspection and public postconditions', async () => cosmeticNegative(context));
    await check('private dispatcher and declared input domains', async () => dispatcherAndDomainNegatives(context));
    await check('historical tests/format refusals', async () => historicalAdmissionNegatives(context));
    await check('CI sources unchanged during execution', async () => assert.deepEqual(await testSourceHashes(), sourceHashes));
    const report = { runtimeRoot: context.runtimeRoot, artifactsRoot: context.root,
      archiveCases: 18, newSyntheticWitnesses: 12, independentProblems: 3,
      positivePassed: outcomes.filter(r => r.id.startsWith('positive:') && r.passed).length,
      positiveFailed: outcomes.filter(r => r.id.startsWith('positive:') && !r.passed).length,
      failures: outcomes.filter(r => !r.passed), outcomes, witnesses, sourceHashes,
      limitation: 'Offline CI of finite host evidence and an explicitly honest report; not a measured Qwen acceptance rate.' };
    if (process.env.HONEST_WORKER_REPORT_OUT) await fs.writeFile(process.env.HONEST_WORKER_REPORT_OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ positives: report.positivePassed, required: 30,
      failedChecks: report.failures.length, artifactsRoot: context.root }));
    for (const failure of report.failures) console.error(`${failure.id}: ${failure.code}: ${failure.message}`);
    assert.equal(report.failures.length, 0, 'all honest positives and refusal controls must hold');
  } finally { await host.close(context); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
