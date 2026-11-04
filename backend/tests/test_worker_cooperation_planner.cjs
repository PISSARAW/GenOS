'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const contract = require('./helpers/workerCooperationPlannerContract.cjs');
const findingReader = require('./helpers/workerCooperationFinding.cjs');
const { hash } = require('./helpers/workerCooperationLiveEvidence.cjs');

const finding = { runId: 'verified-daemon-run', observation: { observedSum: 13, target: 17, anomaly: true },
  facts: { problem: { values: [4, 9, 6, 3, 8], target: 17 }, allocation: { indices: [0, 1] } },
  sourceRefs: ['sha256:' + 'a'.repeat(64)], receiptId: 'persisted-receipt', oracleHash: 'verified-oracle' };

function plan() {
  return { findingRunId: finding.runId, decision: 'repair', steps: [
    { kind: 'specialist', dependsOn: ['finding'], goal: 'Propose indices totaling 17.' },
    { kind: 'verifier_worker', dependsOn: ['specialist'], goal: 'Recompute from original values.' },
    { kind: 'recovery_worker', dependsOn: ['verifier_worker'], goal: 'Restore only an accepted differing checkpoint.' }
  ] };
}

function refusals() {
  assert.equal(contract.validatePlan(plan(), finding).decision, 'repair');
  const healthy = { ...finding, observation: { observedSum: 17, target: 17, anomaly: false } };
  assert.equal(contract.validatePlan({ findingRunId: finding.runId, decision: 'stop', steps: [] }, healthy).decision, 'stop');
  assert.throws(() => contract.validatePlan(plan(), healthy));
  const foreign = { ...plan(), findingRunId: 'other-daemon' };
  assert.throws(() => contract.validatePlan(foreign, finding), /supplied daemon run/);
  const forward = plan();
  [forward.steps[0], forward.steps[1]] = [forward.steps[1], forward.steps[0]];
  assert.throws(() => contract.validatePlan(forward, finding), /Future|prerequisite/);
  const repeated = plan();
  repeated.steps[2] = repeated.steps[1];
  assert.throws(() => contract.validatePlan(repeated, finding), /duplicate/);
  const unobserved = plan();
  unobserved.steps[0].dependsOn = [];
  assert.throws(() => contract.validatePlan(unobserved, finding), /prerequisite/);
  for (const kind of ['observes', 'proposes', 'resident_daemon']) {
    const invalid = plan();
    invalid.steps[0].kind = kind;
    assert.throws(() => contract.validatePlan(invalid, finding), /Unknown/);
  }
}

function sourceContractRequest() {
  const request = contract.request(finding);
  const input = JSON.parse(request.prompt.split('PLANNER_INPUT_JSON\n')[1]);
  assert.deepEqual(input.finding, finding);
  assert.equal(input.availableRoles[0].requires[0], 'finding');
  const kinds = request.responseFormat.schema.properties.steps.items.properties.kind.enum;
  assert.deepEqual(kinds, ['specialist', 'verifier_worker', 'recovery_worker']);
  const binding = { missionId: 'mission', workerId: 'daemon', parentWorkerId: 'mission',
    genome: { workerContract: { identity: { workerKind: 'resident_daemon' } } } };
  findingReader.assertOwner(binding, { missionId: 'mission', workerId: 'daemon' });
  assert.throws(() => findingReader.assertOwner(binding, { missionId: 'foreign', workerId: 'daemon' }));
  assert.throws(() => findingReader.assertOwner({ ...binding, parentWorkerId: 'foreign' },
    { missionId: 'mission', workerId: 'daemon' }));
}

async function changedSource() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-planner-source-'));
  const problem = JSON.stringify(finding.facts.problem);
  const allocation = JSON.stringify(finding.facts.allocation);
  const sealed = { version: 1, kind: 'resource_allocation', mode: 'observation', indexBase: 0,
    files: { problem: 'problem.json', allocation: 'allocation.json' }, sources: [
      { path: 'problem.json', sha256: hash(problem) }, { path: 'allocation.json', sha256: hash(allocation) }
    ] };
  try {
    await fs.writeFile(path.join(workspace, 'problem.json'), problem);
    await fs.writeFile(path.join(workspace, 'allocation.json'), allocation);
    assert.deepEqual(await findingReader.sourceFacts({ workspace }, sealed), finding.facts);
    await fs.writeFile(path.join(workspace, 'allocation.json'), '{"indices":[1,4]}');
    await assert.rejects(findingReader.sourceFacts({ workspace }, sealed), /Source changed/);
  } finally {
    assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
    assert.ok(path.basename(workspace).startsWith('genos-planner-source-'));
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function main() {
  refusals();
  sourceContractRequest();
  await changedSource();
  console.log('Planner contract: source-bound finding, healthy stop, prior failures, dependency and authority refusals PASS.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
