'use strict';

const { digest } = require('./evidenceContractService');

function successfulEvent(dossier) {
  return [...(dossier?.events || [])].reverse().find((event) =>
    event.eventType === 'AGENT_COMPLETED'
      && event.evidenceReport?.outcome === 'success'
      && verificationRef(event));
}

function validReplay(receipt, snapshot) {
  return receipt?.success === true && receipt.replay_status === 'VERIFIED'
    && receipt.execution_replayed === true && receipt.snapshot_id && receipt.final_chain_hash
    && typeof snapshot === 'string' && receipt.snapshot === snapshot;
}

function resolveRequiredWorkers(workers, dossiers) {
  const byWorker = new Map((dossiers || []).map((dossier) => [dossier.workerId, dossier]));
  const claimed = new Set();
  return (workers || []).map((worker) => {
    const current = byWorker.get(worker.agentId);
    if (successfulEvent(current)) {
      claimed.add(worker.agentId);
      return worker;
    }
    const replacement = (dossiers || []).find((dossier) => dossier.workerId !== worker.agentId
      && !claimed.has(dossier.workerId) && dossier.role === worker.role && successfulEvent(dossier));
    if (!replacement) return worker;
    claimed.add(replacement.workerId);
    return { ...worker, agentId: replacement.workerId };
  });
}

function verificationRef(event) {
  if (event?.nativeOracleRef?.hash && event.nativeOracleRef?.eventId) {
    return { kind: 'native-oracle', id: event.nativeOracleRef.hash, value: event.nativeOracleRef };
  }
  return null;
}

function memberRecord(missionId, worker, dossier) {
  const event = successfulEvent(dossier);
  if (!event) return { member: { memberId: worker.agentId, status: 'partial', evidenceRefs: [] }, proof: null, oracleRef: null };
  const verifier = verificationRef(event);
  const content = { schema: 'genos.worker-barrier-closure-proof/v1', missionId,
    workerId: worker.agentId, executionRunId: event.executionRunId,
    result: { status: 'completed', verified: true },
    evidenceReportHash: digest(event.evidenceReport), verification: verifier };
  const proof = { reference: digest(content), content, source: 'worker_evidence_barrier' };
  return { member: { memberId: worker.agentId, status: 'completed', evidenceRefs: [proof.reference] },
    proof, oracleRef: verifier };
}

function closureOracle(missionId, records) {
  if (!records.length || records.some((record) => !record.oracleRef || !record.proof)) return null;
  const receipt = { schema: 'genos.worker-barrier-oracle/v1', missionId,
    sourceOracleRefs: records.map((record) => record.oracleRef) };
  return { status: 'verified', independent: true,
    verifierIds: records.map((record) => `${record.oracleRef.kind}:${record.oracleRef.id}`),
    evidenceRefs: records.map((record) => record.proof.reference),
    receipt, receiptHash: digest(receipt) };
}

function buildClosureInput(input = {}) {
  const byWorker = new Map((input.dossiers || []).map((dossier) => [dossier.workerId, dossier]));
  const records = (input.workers || []).map((worker) =>
    memberRecord(input.missionId, worker, byWorker.get(worker.agentId)));
  return { missionId: input.missionId, topology: input.topology || 'delegated_workers',
    lifecycleState: input.lifecycleState || 'completed', producerId: input.producerId,
    requiredMemberIds: (input.workers || []).map((worker) => worker.agentId),
    members: records.map((record) => record.member),
    evidenceProofs: records.map((record) => record.proof).filter(Boolean),
    topologyValidation: { status: 'verified', reasons: [] },
    barrierStatus: input.barrierStatus || 'complete', invariants: input.invariants,
    oracle: closureOracle(input.missionId, records) };
}

function topologyContext(ctx) {
  if (ctx.autonomyPlan?.trinity?.activated) {
    return { id: 'trinity', decisionPassed: Boolean(ctx.comparison?.outcome) };
  }
  if (ctx.autonomyPlan?.aTeam?.activated) {
    return { id: 'a_team', decisionPassed: ctx.integration?.canMerge === true };
  }
  return { id: 'delegated_workers', decisionPassed: true };
}

module.exports = { buildClosureInput, successfulEvent, topologyContext, validReplay, resolveRequiredWorkers };
