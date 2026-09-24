const { activeWorkerBarriers, workerEvidenceRounds, emit, updateAgent } = require('./agentOrchestrationState');
const { workerEvidenceDossiers, buildWorkerSynthesisPrompt } = require('./agentEvidenceService');

function isUsablePartialEvent(event) {
  return Boolean(event && (event.evidenceReport || event.noAnswerProof));
}

function hasUsablePartialEvent(events) {
  return Array.isArray(events) && events.some(isUsablePartialEvent);
}

function isUsablePartialDossier(dossier) {
  return Boolean(dossier && hasUsablePartialEvent(dossier.events));
}

function selectUsablePartialDossiers(dossiers) {
  return Array.isArray(dossiers) ? dossiers.filter(isUsablePartialDossier) : [];
}

function workerIdList(workers) {
  return workers.map((worker) => worker.agentId);
}

function usableWorkerIdSet(usableDossiers) {
  return new Set(usableDossiers.map((dossier) => dossier.workerId));
}

function findFaultyWorkers(workers, usableIds) {
  return workers.filter((worker) => !usableIds.has(worker.agentId));
}

function partialDetailText(completed, total) {
  return `${completed}/${total} workers terminal; continuing with partial evidence.`;
}

function clearBarrier(agentId) {
  activeWorkerBarriers.delete(agentId);
  workerEvidenceRounds.delete(agentId);
}

function emitStarted(ctx) {
  emit(ctx.agentId, 'WORKER_EVIDENCE_BARRIER_STARTED', 'WAIT_FOR_WORKERS', ctx.detail, {
    workerIds: workerIdList(ctx.workers)
  }, 'info', 'running');
}

function emitPartialTerminal(ctx) {
  const total = ctx.workers.length;
  const completed = ctx.usable.length;
  const reason = ctx.partialReason || 'unknown';
  emit(ctx.agentId, 'WORKER_EVIDENCE_BARRIER_PARTIAL', 'SYNTHESIZE_PARTIAL', `${partialDetailText(completed, total)} Reason: ${reason}`, {
    workerIds: workerIdList(ctx.workers), workersCompleted: completed, workersTotal: total,
    dossierCount: completed, partial: true, partialReason: reason
  }, 'warning', 'running');
}

function emitSatisfiedTerminal(ctx) {
  const evidenceCount = ctx.usable.reduce((count, dossier) => count + dossier.events.length, 0);
  emit(ctx.agentId, 'WORKER_EVIDENCE_BARRIER_SATISFIED', 'SYNTHESIZE', 'Every delegated worker is terminal and all collected dossiers were attached to the official root synthesis.', {
    workerIds: workerIdList(ctx.workers), dossierCount: ctx.usable.length, partial: false, evidenceEventCount: evidenceCount
  }, 'info', 'running');
}

function emitDossiersAttached(ctx) {
  emit(ctx.agentId, 'WORKER_EVIDENCE_DOSSIERS_ATTACHED', 'ATTACH_DOSSIERS', ctx.detail, {
    workerIds: workerIdList(ctx.workers), dossierCount: ctx.usable.length, partial: ctx.partial, dossiers: ctx.usable
  }, 'info', 'running');
}

function emitHaltedOrFailed(ctx) {
  const halted = ctx.cancelled;
  emit(ctx.agentId, halted ? 'WORKER_EVIDENCE_BARRIER_HALTED' : 'WORKER_EVIDENCE_BARRIER_FAILED', halted ? 'STOP' : 'WAIT_FOR_WORKERS', ctx.error.message, {
    workerIds: workerIdList(ctx.workers)
  }, halted ? 'warning' : 'error', halted ? 'blocked' : 'error');
}

function stripDelegationTools(lease) {
  return Array.isArray(lease) ? lease.filter((tool) => tool !== 'genos_delegate_worker' && tool !== 'genos_trinity_launch') : [];
}

function applySynthesisPlan(ctx) {
  ctx.normalizedMission.prompt = buildWorkerSynthesisPrompt(ctx.promptBase, ctx.usable);
  ctx.normalizedMission.toolLease = stripDelegationTools(ctx.normalizedMission.toolLease);
  ctx.autonomyPlan.synthesisOnly = true;
  ctx.autonomyPlan.dispatchWorkers = [];
  ctx.autonomyPlan.completedWorkerIds = ctx.usable.map((dossier) => dossier.workerId);
  ctx.autonomyPlan.mandatoryTools = stripDelegationTools(ctx.autonomyPlan.mandatoryTools);
}

function loadDossiers(ctx) {
  return workerEvidenceDossiers(ctx.agentId, ctx.workers);
}

function readContract(ctx) {
  return ctx.contractRecord ? ctx.contractRecord.contract : undefined;
}

async function stopWorkersQuietly(workers) {
  const adapter = require('./agentRuntimeAdapter');
  await Promise.allSettled(workers.map((worker) => adapter.stopMission(worker.agentId)));
}

async function setupBarrier(ctx) {
  const barrier = { cancelled: false, workerIds: new Set(workerIdList(ctx.workers)) };
  activeWorkerBarriers.set(ctx.agentId, barrier);
  workerEvidenceRounds.set(ctx.agentId, {
    workerIds: new Set(workerIdList(ctx.workers)), participants: new Map(), events: new Map()
  });
  await updateAgent(ctx.agentId, 'running', 'Waiting for delegated evidence before final synthesis');
  emitStarted({ agentId: ctx.agentId, workers: ctx.workers, detail: ctx.detail });
  return barrier;
}

module.exports = {
  applySynthesisPlan, clearBarrier, emitDossiersAttached, emitHaltedOrFailed,
  emitPartialTerminal, emitSatisfiedTerminal, findFaultyWorkers, isUsablePartialDossier,
  loadDossiers, readContract, selectUsablePartialDossiers, setupBarrier,
  stopWorkersQuietly, usableWorkerIdSet, workerIdList
};
