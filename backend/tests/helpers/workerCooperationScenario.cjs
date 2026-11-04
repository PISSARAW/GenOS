'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const runtime = require('./workerCooperationRuntime.cjs');
const { executeNativeWorker } = require('../../src/services/agents/workerExecutorRegistry');
const { assertAssignmentMatches, enforcePersistedWorkerTool } = require('../../src/services/agents/workerContractEnforcement');

const hash = value => createHash('sha256').update(value).digest('hex');
const method = (methodId, parameters) => ({ version: 1, methodId, parameters });
const procedure = method('subset_sum', { values: [3, 5, 7], target: 10 });
const objective = (goal, methodContract) => ({ goal, methodContract, successCriteria: ['Persist a result accepted by two independent native oracles.'] });

function errorIn(state) {
  assert.equal(new Set(state.indices).size, state.indices.length);
  const sum = state.indices.reduce((total, index) => total + procedure.parameters.values[index], 0);
  return Math.abs(sum - procedure.parameters.target);
}

async function authorityRefusals(context, stage) {
  for (const toolName of ['genos_merge', 'genos_delegate_worker', 'genos_change_organization', 'genos_run']) {
    await assert.rejects(enforcePersistedWorkerTool(context.db, stage.workerId, { toolName, args: {} }),
      { code: 'WORKER_CONTRACT_DENIED' });
  }
  const altered = structuredClone(stage.contract.mission.methodContract);
  altered.parameters.injected = true;
  assert.throws(() => assertAssignmentMatches(stage.contract, { methodContract: altered }),
    { code: 'WORKER_METHOD_MISMATCH' });
}

async function monitor(context) {
  const raw = await fs.readFile(path.join(context.workspace, 'allocation.json'), 'utf8');
  const sourceRef = `file://allocation.json#sha256:${hash(raw)}`;
  const sampledError = errorIn(JSON.parse(raw));
  const stage = await runtime.execute(context, { expectedKind: 'resident_daemon', inputRefs: [sourceRef],
    objective: objective('Measure allocation error from the content-addressed workspace observation.', method('monitor_samples', {
      territoryId: context.id, threshold: 0,
      samples: [{ value: sampledError, sourceRef, observedAt: new Date().toISOString() }]
    })) });
  const findings = stage.report.workerArtifact.content.anomalies;
  assert.equal(findings.length, sampledError > 0 ? 1 : 0);
  assert.deepEqual(stage.report.workerArtifact.provenance.sourceRefs, [sourceRef]);
  await authorityRefusals(context, stage);
  return stage;
}

async function solve(context, observation) {
  const source = observation.report.workerArtifact.content.anomalies[0];
  assert.ok(source, 'No repair may be scheduled without a finding.');
  const candidate = await runtime.execute(context, { expectedKind: 'specialist', inputRefs: [observation.runId, source.sourceRef],
    objective: objective(`Resolve the capacity allocation detected by ${observation.runId}; preserve ${source.sourceRef}.`,
      method('niche_procedure', { niche: 'resource_allocation', procedure })) });
  await authorityRefusals(context, candidate);
  const content = candidate.report.workerArtifact.content;
  assert.equal(content.result.found, true);
  assert.equal(content.result.sum, procedure.parameters.target);
  return candidate;
}

async function verify(context, candidate) {
  const candidateReceipt = candidate.report.workerArtifact.content.procedureReceipt;
  const check = method('verify_procedure', { procedure, candidateReceipt });
  const verified = await runtime.execute(context, { expectedKind: 'verifier_worker', inputRefs: [candidate.runId, candidateReceipt.id],
    objective: objective(`Independently check candidate ${candidateReceipt.id} from run ${candidate.runId} before application.`, check) });
  assert.notEqual(verified.workerId, candidate.workerId);
  assert.equal(verified.report.workerArtifact.content.verdict, 'accept');
  assert.equal(verified.report.workerArtifact.content.candidateReceiptId, candidateReceipt.id);
  const forged = structuredClone(check);
  forged.parameters.candidateReceipt.result.sum += 1;
  const rejection = await executeNativeWorker('verifier_worker', forged, { mission: {} });
  assert.equal(rejection.verdict, 'reject');
  await authorityRefusals(context, verified);
  return verified;
}

async function recoveryRefusals(stage, input) {
  const mission = { agentId: stage.workerId, workerContract: stage.contract, workspaceRoot: stage.workspaceRoot };
  const context = { mission, deadline: Date.now() + 10000 };
  // The state already matches the checkpoint: replaying a stale assignment must fail.
  await assert.rejects(executeNativeWorker('recovery_worker', input, context), { code: 'WORKER_RECOVERY_CONFLICT' });
  const unleased = structuredClone(mission);
  unleased.workerContract.mission.recoveryLease = null;
  await assert.rejects(executeNativeWorker('recovery_worker', input, { ...context, mission: unleased }),
    { code: 'WORKER_CONTRACT_DENIED' });
}

async function recover(context, checkpoint, verification) {
  const target = path.join(context.workspace, 'allocation.json');
  const damaged = await fs.readFile(target, 'utf8');
  assert.notEqual(hash(damaged), hash(checkpoint));
  assert.ok(errorIn(JSON.parse(damaged)) > 0);
  const restore = method('restore_checkpoint', { path: 'allocation.json', content: checkpoint,
    checkpointDigest: hash(checkpoint), expectedCurrentDigest: hash(damaged) });
  const task = { ...objective(`Restore the checkpoint accepted by verification run ${verification.runId}.`, restore),
    recoveryLease: { action: 'restore_checkpoint', path: 'allocation.json' } };
  const stage = await runtime.execute(context, { expectedKind: 'recovery_worker', objective: task,
    inputRefs: [verification.runId, `sha256:${hash(checkpoint)}`, `sha256:${hash(damaged)}`] });
  assert.equal(await fs.readFile(path.join(stage.workspaceRoot, 'allocation.json'), 'utf8'), checkpoint);
  await recoveryRefusals(stage, restore);
  // The capsule is the recovery target; no implicit promotion to the source workspace.
  assert.equal(await fs.readFile(target, 'utf8'), damaged);
  return stage;
}

async function runScenario(db, input) {
  const workspace = path.join(input.root, input.name);
  await fs.mkdir(workspace);
  const initial = JSON.stringify({ indices: input.healthy ? [0, 2] : [0, 1] });
  await fs.writeFile(path.join(workspace, 'allocation.json'), initial);
  const maxStages = input.healthy ? 1 : input.corrupt ? 4 : 3;
  const context = await runtime.seed(db, { id: `cooperation-${input.name}`, workspace, maxStages });
  const observation = await monitor(context);
  let responsePlan = [];
  let finalError = errorIn(JSON.parse(initial));
  let finalState = JSON.parse(initial);
  if (observation.report.workerArtifact.content.anomalies.length) {
    responsePlan = [{ kind: 'specialist', dependsOn: 'resident_daemon' },
      { kind: 'verifier_worker', dependsOn: 'specialist' },
      { kind: 'recovery_worker', dependsOn: 'verifier_worker', condition: 'checkpoint_corrupted' }];
    await fs.writeFile(path.join(workspace, 'response-plan.json'), JSON.stringify(responsePlan));
    const candidate = await solve(context, observation);
    const verified = await verify(context, candidate);
    const checkpoint = JSON.stringify({ indices: candidate.report.workerArtifact.content.result.indices });
    // Application is an explicit action of this isolated qualification driver.
    assert.equal(verified.report.workerArtifact.content.verdict, 'accept');
    await fs.writeFile(path.join(workspace, 'allocation.json'), checkpoint);
    let finalRoot = workspace;
    const target = path.join(workspace, 'allocation.json');
    if (input.corrupt) await fs.writeFile(target,
      JSON.stringify({ indices: [1], incident: 'controlled post-verification corruption' }));
    const currentDigest = hash(await fs.readFile(target));
    if (currentDigest !== hash(checkpoint)) finalRoot = (await recover(context, checkpoint, verified)).workspaceRoot;
    finalState = JSON.parse(await fs.readFile(path.join(finalRoot, 'allocation.json'), 'utf8'));
    finalError = errorIn(finalState);
    assert.equal(finalError, 0);
  }
  const persisted = JSON.parse(await fs.readFile(path.join(workspace, 'cooperation-context.json'), 'utf8'));
  assert.deepEqual(persisted, context.stages);
  const sourceFinalError = errorIn(JSON.parse(await fs.readFile(path.join(workspace, 'allocation.json'), 'utf8')));
  return { name: input.name, responsePlan, initialState: JSON.parse(initial), finalState,
    initialError: errorIn(JSON.parse(initial)), finalError, sourceFinalError,
    stages: context.stages, controller: await runtime.controlEvidence(context),
    promoted: false, recoveryScope: 'isolated_worker_capsule' };
}

module.exports = { runScenario };
