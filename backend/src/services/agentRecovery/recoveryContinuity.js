'use strict';

const { digest } = require('../biologicalIntegrity');
const store = require('../biologicalWorkerStore');
const attempts = require('../regenerationAttemptService');
const failure = code => Object.assign(new Error(code), { code });

async function winner(db, mission) {
  const run = await db.get('SELECT id,status FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', mission.agentId);
  if (run?.status !== 'completed') return null;
  const receipt = await store.receipt(db, run.id);
  if (receipt?.result.verified !== true || receipt?.budgetAssessment.satisfied !== true
      || !require('../biologicalWorkerReceiptService').semanticReceiptAccepted(receipt.semanticVerification)) return null;
  const binding = await store.binding(db, run.id);
  if (binding?.missionId !== mission.missionId || binding?.workerId !== mission.agentId) throw failure('RECOVERY_CONTINUITY_SCOPE_MISMATCH');
  const terminal = (await store.observations(db, run.id)).find(item => item.applied && item.event.eventType === 'AGENT_COMPLETED');
  if (!terminal) throw failure('RECOVERY_CONTINUITY_PROOF_REQUIRED');
  const native = await require('../epistemic/nativeOracleGate').historical(db, {
    runId: run.id, agentId: mission.agentId, event: terminal.event });
  await require('../aeisAssemblyStore').readAssembly(db, native.proof.attestation.value.assemblyId);
  await require('../epistemic/nativeOracleProof').assertCompletedEvidence(db, { proof: native.proof,
    request: { runId: run.id, agentId: mission.agentId }, report: terminal.event.payload.evidenceReport });
  return { binding, receipt };
}

function equivalentBindings(source, target) {
  return Boolean(source?.genome.workerContract && target?.genome.workerContract
    && source.missionId === target.missionId && source.parentWorkerId === target.parentWorkerId
    && digest(source.tenant) === digest(target.tenant)
    && digest(source.genome.workerContract) === digest(target.genome.workerContract));
}

async function registerSource(db, input) {
  const { lostId, verified } = input;
  const binding = verified.binding;
  const source = await store.latestBindingForMission(db, { missionId: binding.missionId, workerId: lostId });
  const member = await db.get('SELECT a.parent_agent_id FROM agents a JOIN mission_agents m ON m.agent_id=a.id WHERE a.id=? AND m.mission_id=?', lostId, binding.missionId);
  if (!equivalentBindings(source?.binding, binding) || member?.parent_agent_id !== binding.parentWorkerId) {
    throw failure('RECOVERY_CONTINUITY_CONTRACT_MISMATCH');
  }
  await assertFailedSource(db, lostId);
  const request = { missionId: binding.missionId, lostIdentifier: lostId,
    replacementId: binding.workerId, role: binding.genome.workerContract.identity.workerKind };
  const evidenceRef = `genos://worker-receipt/${verified.receipt.receiptId}/${digest(verified.receipt)}`;
  const reserved = await attempts.reserve(db, request);
  if (!reserved.reserved) {
    const previous = await db.get('SELECT * FROM mission_regeneration_attempts WHERE mission_id=? AND lost_agent_id=?', binding.missionId, lostId);
    if (previous?.status === 'verified' && previous.replacement_id === binding.workerId && previous.evidence_ref === evidenceRef) return;
    throw failure('RECOVERY_CONTINUITY_RESERVATION_REFUSED');
  }
  await attempts.mark(db, { ...request, status: 'verified', evidenceRef });
}

async function assertFailedSource(db, workerId) {
  const run = await db.get('SELECT status FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', workerId);
  if (!['failed', 'blocked', 'cancelled'].includes(run?.status)) throw failure('RECOVERY_CONTINUITY_SOURCE_NOT_FAILED');
}

async function adopt(db, input) {
  const { mission, sourceAgentId } = input;
  if (mission.agentId === sourceAgentId) return false;
  return require('../../db').withTransaction(db, async () => {
    const verified = await winner(db, mission);
    if (!verified) return false;
    const lostIds = [...new Set([sourceAgentId, ...(mission.recoveryHistory || []).map(item => item.workerId)])]
      .filter(id => id && id !== mission.agentId);
    if (lostIds.length > 3) throw failure('RECOVERY_CONTINUITY_HISTORY_LIMIT');
    for (const lostId of lostIds) await registerSource(db, { lostId, verified });
    return true;
  });
}

module.exports = { adopt, equivalentBindings, assertFailedSource };
