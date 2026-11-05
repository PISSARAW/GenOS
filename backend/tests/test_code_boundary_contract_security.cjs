'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const host = require('./honestWorkerHostHarness.cjs');
const { fresh } = require('./honestWorkerFreshFixtures.cjs');

async function sealedContract(context) {
  const input = await host.prepare(context, fresh[0]);
  input.mission.toolLease = [];
  input.mission.timeoutMs = 60000;
  const authority = host.runtime('src/services/missionEnvelopeAuthority');
  await authority.seal({ db: input.db, agentId: input.mission.agentId,
    executionRun: input.executionRun, executable: process.execPath,
    normalizedMission: input.mission, autonomyPlan: {} });
  const saved = await authority.read(input.db, input.executionRun.id);
  const binding = host.runtime('src/services/codeBoundaryContract').authorityBinding(input.mission);
  assert.equal(saved.envelope.boundaryTestContractHash, binding.boundaryTestContractHash);
  const alteredDomain = { ...input, mission: structuredClone(input.mission) };
  alteredDomain.mission.boundaryTestContract.api.domains.functions.durationMinutes[0] = 'json';
  await assert.rejects(host.runtime('src/services/localCodeWorkerService').executeProposal(alteredDomain),
    { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  const alteredAnchor = { ...input, mission: structuredClone(input.mission) };
  alteredAnchor.mission.boundaryTestContract.sourceHashes['module.cjs'] = '0'.repeat(64);
  await assert.rejects(host.runtime('src/services/localCodeWorkerService').executeProposal(alteredAnchor),
    { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  input.mission.boundaryTestContract.api.functions.push('cosmeticHelper');
  input.mission.boundaryTestContract.api.domains.functions.cosmeticHelper = [];
  await assert.rejects(host.runtime('src/services/localCodeWorkerService').executeProposal(input),
    { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
}
async function coldBaselineRefusesCandidate(context) {
  const input = await host.prepare(context, fresh[0]);
  input.mission.preserveFailedCodeCandidate = true;
  const correct = input.text, bad = JSON.parse(correct);
  bad.patches[0].content = 'module.exports={durationMinutes:()=>999};\n';
  input.text = JSON.stringify(bad);
  const execute = host.runtime('src/services/localCodeWorkerService').executeProposal;
  await assert.rejects(execute(input), { code: 'Q7_BOUNDARY_PATCH_FAILED' });
  delete require.cache[require.resolve(path.join(context.runtimeRoot, 'backend/src/services/codeBoundaryExecution.js'))];
  input.text = correct;
  await assert.rejects(execute(input), { code: 'Q7_BASELINE_ANCHOR_UNAVAILABLE' });
  assert.equal(await fs.readFile(path.join(input.workspaceRoot, 'module.cjs'), 'utf8'), bad.patches[0].content);
  const row = await input.db.get("SELECT COUNT(*) AS n FROM telemetry_events WHERE agent_id=? AND event_type='CODE_CANDIDATE_OBSERVED'", input.mission.agentId);
  assert.equal(row.n, 1, 'cold refusal happens before any new candidate is applied');
}
async function originalSurvivesRetry(context) {
  const fixture = fresh[0], input = await host.prepare(context, fixture);
  input.mission.preserveFailedCodeCandidate = true;
  const good = input.text, bad = JSON.parse(good);
  bad.patches[0].content = 'module.exports={durationMinutes:()=>999};\n';
  input.text = JSON.stringify(bad);
  const storage = host.runtime('src/services/asyncContext').asyncLocalStorage;
  await assert.rejects(storage.run(new Map([['traceId', 'q7-trace'], ['requestId', 'q7-request']]),
    () => host.runtime('src/services/localCodeWorkerService').executeProposal(input)),
    { code: 'Q7_BOUNDARY_PATCH_FAILED' });
  assert.equal(await fs.readFile(path.join(input.workspaceRoot, 'module.cjs'), 'utf8'), bad.patches[0].content);
  input.text = good;
  const proposal = await host.runtime('src/services/localCodeWorkerService').executeProposal(input);
  const original = require('./honestWorkerOriginals.cjs')[fixture.task].source;
  assert.equal(proposal.boundaryEvidence.sources[0].beforeHash,
    host.runtime('src/services/trinityProvenanceValues').hashBytes(Buffer.from(original)));
}
async function symlinkWorld(context) {
  const input = await host.prepare(context, fresh[0]);
  const outside = path.join(context.root, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(input.workspaceRoot, '.genos'), 'junction');
  await assert.rejects(host.runtime('src/services/localCodeWorkerService').executeProposal(input),
    { code: 'Q7_BOUNDARY_WORLD_INVALID' });
  assert.deepEqual(await fs.readdir(outside), [], 'refusal precedes writing outside the capsule');
}
async function sourceRealmArguments(context) {
  const fixture = { ...fresh.find(item => item.task === 'T2'), id: 'legitimate-array-object-realm', source:
    'exports.stableSort=records=>{if(!(records instanceof Array)||records.some(r=>!(r instanceof Object)))throw TypeError("wrong realm");return records.slice().sort((a,b)=>a.key-b.key);};\n' };
  const { proposal } = await host.execute(context, fixture);
  assert.equal(proposal.testStatus, 'passed');
  assert.equal(proposal.boundaryEvidence.candidate.runnerResult.status, 'passed');
}
async function earlyIsoYear(context) {
  const check = JSON.stringify({ schema: 'genos.boundary-cases/v1', cases: [{ id: 'year0000-leap-offset',
    steps: [{ op: 'call', name: 'durationMinutes',
      args: ['0000-02-29T01:05:00+01:00', '0000-02-29T03:35:00+02:00'], expected: 90 }] }] });
  const { proposal } = await host.execute(context, fresh[0], { check });
  assert.equal(proposal.boundaryEvidence.candidate.exitCode, 0);
  assert.equal(proposal.boundaryEvidence.baseline.regression, 'assertion');
}
async function subjectCannotForgeHostAssertion(context) {
  const baseline = 'exports.durationMinutes=(a,b)=>{if(a.startsWith("2040-01-02"))throw Object.assign(new Error("AssertionError ERR_ASSERTION"),{code:"ERR_ASSERTION"});return(Date.parse(b)-Date.parse(a))/60000;};\n';
  const cases = [['first', '2024-01-01T00:00:00Z'], ['forged', '2040-01-02T00:00:00Z']]
    .map(([id, start]) => ({ id, steps: [{ op: 'call', name: 'durationMinutes',
      args: [start, start.replace('T00:', 'T01:')], expected: 60 }] }));
  const check = JSON.stringify({ schema: 'genos.boundary-cases/v1', cases });
  await assert.rejects(host.execute(context, fresh[0], { baseline, check }), error => {
    assert.equal(error.code, 'Q7_BOUNDARY_NON_DISCRIMINATING');
    const test = error.boundaryFailureDiagnostics.tests.find(item => item.role === 'baseline_generated');
    assert.equal(test.runnerResult.kind, 'error');
    assert.equal(test.failureKind, 'runner_error');
    return true;
  });
}
async function mutatedTests(context) {
  for (const relative of ['module.cjs', 'boundary-cases.json', '.genos/boundary-check.cjs']) {
    const input = await host.prepare(context, fresh[0]);
    const visible = path.join(input.workspaceRoot, 'visible.test.cjs');
    const mutation = `require('node:fs').appendFileSync(${JSON.stringify(relative)},'\\n');\n`;
    await fs.appendFile(visible, mutation);
    await assert.rejects(host.runtime('src/services/localCodeWorkerService').executeProposal(input),
      { code: 'Q7_BOUNDARY_SOURCE_CHANGED' });
  }
}
async function observedRefusal(context) {
  const input = await host.prepare(context, fresh[0]);
  const value = JSON.parse(input.text);
  value.patches[0].content = 'module.exports={durationMinutes:()=>999};\n';
  input.text = JSON.stringify(value);
  const storage = host.runtime('src/services/asyncContext').asyncLocalStorage;
  await assert.rejects(storage.run(new Map([['traceId', 'q7-observer-trace'], ['requestId', 'q7-observer-request']]),
    () => host.runtime('src/services/localCodeWorkerService').executeProposal(input)),
    { code: 'Q7_BOUNDARY_PATCH_FAILED' });
  const row = await input.db.get("SELECT payload_json FROM telemetry_events WHERE agent_id=? AND event_type='CODE_CANDIDATE_OBSERVED'", input.mission.agentId);
  const observation = JSON.parse(row.payload_json);
  assert.equal(observation.traceId, 'q7-observer-trace');
  assert.equal(observation.requestId, 'q7-observer-request');
  assert.equal(observation.promoted, false);
  assert.equal(observation.files.find(item => item.path === 'module.cjs').content, value.patches[0].content);
  const { candidateHash } = observation;
  const hash = host.runtime('src/services/codeCandidateObservation').hash;
  assert.equal(candidateHash, hash(observation));
  assert.equal(candidateHash, hash({ ...observation, traceId: 'different annotation' }));
  assert.deepEqual(host.runtime('src/services/codeBoundaryEvidence').references(observation), []);
}
async function main() {
  const context = await host.start();
  try {
    await sealedContract(context);
    await symlinkWorld(context);
    await mutatedTests(context);
    await observedRefusal(context);
    await originalSurvivesRetry(context);
    await sourceRealmArguments(context);
    await earlyIsoYear(context);
    await subjectCannotForgeHostAssertion(context);
    await coldBaselineRefusesCandidate(context);
    console.log('PASS sealed boundary contract, symlink confinement, source/test/runner mutations, diagnostic refusal capture');
  } finally { await host.close(context); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
