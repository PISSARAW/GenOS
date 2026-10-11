'use strict';

const { emit } = require('./agentOrchestrationState');
const creditMethod = 'replenish_external_quota';

function isRecovery(worker) {
  return worker?.workerKind === 'recovery_worker'
    && worker.workerContract?.mission?.methodContract?.methodId === creditMethod;
}

function validReport(worker, report) {
  const content = report?.workerArtifact?.content;
  const input = worker.workerContract?.mission?.methodContract?.parameters;
  const receipt = content?.creditReceipt?.statement;
  const observation = content?.creditObservation?.statement;
  return report?.outcome === 'success'
    && content?.recoveryReceipt?.action === creditMethod
    && hasMatchingOperation(input, worker)
    && receiptMatches(receipt, input)
    && observationMatches(observation, receipt, input);
}

function hasMatchingOperation(input, worker) {
  const lease = worker.workerContract?.mission?.externalCreditLease;
  return !!input?.operationId && input.operationId === lease?.operationId
    && input.agentId === lease?.targetAgentId;
}

function receiptMatches(receipt, input) {
  return receipt?.operationId === input?.operationId && receipt?.kind === 'external_refill'
    && receipt?.after === input.amount + receipt?.before;
}

function observationMatches(observation, receipt, input) {
  return observation?.agentId === input?.agentId && observation?.balance === receipt?.after
    && observation?.accountVersion === receipt?.afterVersion;
}

function hasDependency(worker, byKey) {
  return (worker.dependsOn || []).some((key) => isRecovery(byKey.get(key)));
}

function dependencyFor(worker, byKey) {
  return (worker.dependsOn || []).map((key) => byKey.get(key)).find(isRecovery);
}

function requireDependency(worker, byKey) {
  const dependency = dependencyFor(worker, byKey);
  if (!dependency) throw failure('EXTERNAL_CREDIT_RECOVERY_REQUIRED',
    `Worker '${worker.label}' has external credits but no planned recovery worker.`);
  const input = dependency.workerContract.mission.methodContract.parameters;
  const recovery = worker.workerContract.mission.regulatoryExternalRecovery;
  const lease = dependency.workerContract.mission.externalCreditLease;
  if (input?.operationId !== recovery?.operationId || input.agentId !== worker.agentId
    || lease?.targetAgentId !== worker.agentId) {
    throw failure('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED',
      `Recovery assignment for '${worker.label}' does not match its external account.`);
  }
  return { dependency, input };
}

async function completedRun(db, agentId) {
  const run = await db.get(`SELECT id FROM strategy_execution_runs
    WHERE agent_id=? AND status='completed' ORDER BY created_at DESC LIMIT 1`, agentId);
  if (!run?.id) throw failure('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED',
    `Recovery worker '${agentId}' has no completed execution run.`);
  return run;
}

async function verifiedAttestation(db, agentId, run) {
  const authority = await require('./missionEnvelopeAuthority').read(db, run.id);
  if (!authority) throw failure('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED',
    `Recovery worker '${agentId}' has no sealed run authority.`);
  const request = { runId: run.id, agentId, scope: authority.envelope.scope };
  const attestation = await require('./epistemic/nativeOracleJournal').read(db, { ...request, kind: 'attestation' });
  if (!attestation?.value?.accepted) throw failure('EXTERNAL_CREDIT_RECOVERY_UNVERIFIED',
    `Recovery worker '${agentId}' has no accepted independent oracle attestation.`);
  await require('./epistemic/nativeOracleProof').read(db, { ...request,
    reference: { hash: attestation.hash, eventId: attestation.eventId } });
}

async function persistedWorker(db, worker, reference) {
  const row = await db.get('SELECT metadata_json FROM agents WHERE id=?', worker.agentId);
  let metadata;
  try { metadata = JSON.parse(row?.metadata_json || '{}'); }
  catch (_) { throw failure('INVALID_WORKER_CONTRACT', `Worker '${worker.agentId}' metadata is invalid.`); }
  const contract = metadata.workerContract;
  if (!contract || contract.identity?.workerKind !== worker.workerKind
    || contract.mission?.externalCredit?.agentId !== worker.agentId
    || contract.mission?.regulatoryExternalRecovery?.operationId !== reference.operationId) {
    throw failure('EXTERNAL_CREDIT_CONTRACT_INVALID',
      `Persisted external recovery plan for '${worker.agentId}' changed before dispatch.`);
  }
  contract.mission.regulatoryExternalRecovery = reference;
  metadata.workerContract = contract;
  await db.run('UPDATE agents SET metadata_json=? WHERE id=?', JSON.stringify(metadata), worker.agentId);
}

async function bindOne(ctx, worker) {
  const { dependency, input } = requireDependency(worker, ctx.byKey);
  const run = await completedRun(ctx.db, dependency.agentId);
  await verifiedAttestation(ctx.db, dependency.agentId, run);
  const reference = { recoveryAgentId: dependency.agentId, recoveryRunId: run.id,
    operationId: input.operationId };
  await persistedWorker(ctx.db, worker, reference);
  worker.workerContract.mission.regulatoryExternalRecovery = reference;
  emit(ctx.orchestratorId, 'REGULATORY_EXTERNAL_RECOVERY_LINKED', 'LINK_RECOVERY_RUN',
    `Linked verified recovery run ${run.id} to ${worker.workerKind} before target dispatch.`,
    { workerId: worker.agentId, ...reference }, 'info');
}

async function bindReferences(ctx) {
  for (const worker of ctx.stageWorkers) {
    const mission = worker.workerContract?.mission;
    if (mission?.externalCredit && !mission.regulatoryExternalRecovery?.recoveryRunId) {
      await bindOne(ctx, worker);
    }
  }
}

function failure(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { isRecovery, validReport, hasDependency, bindReferences };
