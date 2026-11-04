'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { dispatch } = require('./workerCooperationLiveRuntime.cjs');
const evidence = require('./workerCooperationLiveEvidence.cjs');
const planner = require('./workerCooperationPlanner.cjs');

async function task(context, mode) {
  const contract = await evidence.verificationContract(context.workspace, mode);
  const refs = contract.sources.map(item => `sha256:${item.sha256}`);
  const problem = JSON.parse(await fs.readFile(path.join(context.workspace, 'problem.json'), 'utf8'));
  const allocation = JSON.parse(await fs.readFile(path.join(context.workspace, 'allocation.json'), 'utf8'));
  return { verificationContract: contract,
    inputRefs: refs,
    prompt: `Stage: ${mode}. Read-only problem=${JSON.stringify(problem)}, allocation=${JSON.stringify(allocation)}. Indices are zero-based. Compute directly from these supplied facts; no tool execution is needed or claimed. Cite these file references: ${JSON.stringify(refs)}. Return one JSON-encoded object as the first and only claim statement, plus the required fields for your worker type. Do not invent execution, tests or solver receipts.` };
}

async function observe(context) {
  const assignment = await task(context, 'observation');
  const stage = await dispatch(context, { ...assignment, kind: 'resident_daemon',
    prompt: `${assignment.prompt} Report {observedSum:number,target:number,anomaly:boolean}. Supply territoryReport with territoryId allocation, observedAt ${new Date().toISOString()} and sourceRefs containing the file references.` });
  return stage;
}

async function propose(context, observation) {
  const assignment = await task(context, 'candidate');
  return dispatch(context, { ...assignment, kind: 'specialist',
    inputRefs: [...assignment.inputRefs, observation.runId],
    prompt: `${assignment.prompt} ${planner.goal(context, 'specialist')} Verified daemon run ${observation.runId}: ${JSON.stringify(evidence.claim(observation))}. Propose {indices:number[],sum:number} totaling the target. Supply specialtyAssessment {niche:"resource_allocation",inScope:true,evidence:[file references]}.` });
}

async function verify(context, specialist) {
  const candidate = evidence.claim(specialist);
  await fs.writeFile(path.join(context.workspace, 'candidate.json'), JSON.stringify(candidate));
  const assignment = await task(context, 'verification');
  const stage = await dispatch(context, { ...assignment, kind: 'verifier_worker',
    inputRefs: [...assignment.inputRefs, specialist.runId],
    prompt: `${assignment.prompt} ${planner.goal(context, 'verifier_worker')} Candidate from verified specialist run ${specialist.runId}: ${JSON.stringify(candidate)}. Recompute from the original values independently. Report claim {sum:number,target:number,accepted:boolean}. Supply workerArtifact {type:"verification_report",content:{verdict:"accept or reject or unresolved",testedClaim:string,verificationMethod:string,reproductionSteps:[string],evidence:[file references]},provenance:{sourceRefs:[file references]}}.` });
  assert.notEqual(stage.workerId, specialist.workerId);
  assert.equal(evidence.claim(stage).accepted, true);
  assert.equal(stage.report.workerArtifact.content.verdict, 'accept');
  return stage;
}

async function restore(context, specialist, verifier) {
  const raw = await fs.readFile(path.join(context.workspace, 'allocation.json'), 'utf8');
  const checkpoint = JSON.stringify({ indices: evidence.claim(specialist).indices }) + '\n';
  await fs.writeFile(path.join(context.root, 'verified-checkpoint.json'), checkpoint);
  if (evidence.hash(raw) === evidence.hash(checkpoint)) {
    context.report.recovery = { needed: false, matchedCheckpoint: true, sourceUnchanged: true, scope: 'source_already_matches' };
    return;
  }
  const stage = await dispatch(context, { kind: 'recovery_worker',
    prompt: `${planner.goal(context, 'recovery_worker')} Restore only the checkpoint accepted by verifier run ${verifier.runId}, inside the leased capsule.`,
    inputRefs: [verifier.runId, `sha256:${evidence.hash(checkpoint)}`],
    methodContract: { version: 1, methodId: 'restore_checkpoint', parameters: { path: 'allocation.json',
      content: checkpoint, checkpointDigest: evidence.hash(checkpoint), expectedCurrentDigest: evidence.hash(raw) } },
    recoveryLease: { action: 'restore_checkpoint', path: 'allocation.json' } });
  assert.equal(await fs.readFile(path.join(stage.workspaceRoot, 'allocation.json'), 'utf8'), checkpoint);
  assert.equal(await fs.readFile(path.join(context.workspace, 'allocation.json'), 'utf8'), raw);
  context.report.recovery = { needed: true, matchedCheckpoint: true, sourceUnchanged: true, scope: 'isolated_capsule' };
}

async function execute(context) {
  const observation = await observe(context);
  const plan = await planner.planning(context, observation);
  const completed = new Map([['finding', observation]]);
  for (const step of plan.steps) {
    assert.ok(step.dependsOn.every(item => completed.has(item)));
    await require('./workerCooperationFinding.cjs').read(context, observation);
    if (step.kind === 'specialist') completed.set(step.kind, await propose(context, observation));
    else if (step.kind === 'verifier_worker') completed.set(step.kind, await verify(context, completed.get('specialist')));
    else completed.set(step.kind, await restore(context, completed.get('specialist'), completed.get('verifier_worker')));
  }
  context.report.responseDecision = plan.decision;
}

module.exports = { execute };
