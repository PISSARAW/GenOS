'use strict';

const budgetController = require('./morphogenesisEpochBudget');
const { verifiedResolution } = require('./missionResolutionReceipt');

function createMorphogenesisEpochCoordinator(dependencies) {
  return async function adaptNextEpoch(state, orchestratorId) {
    const evidence = await inspectEpochEvidence(state, orchestratorId);
    if (evidence.reason) return stopMorphogenesisEpochs({ ...dependencies, state, orchestratorId,
      reason: evidence.reason, payload: evidence.payload });
    const decision = selectAndReserveEpoch({ ...dependencies, state, orchestratorId, completed: evidence.completed });
    if (decision.reason) return stopMorphogenesisEpochs({ ...dependencies, state, orchestratorId, reason: decision.reason });
    return reconfigureAndDispatchEpoch({ ...dependencies, state, orchestratorId, ...decision });
  };
}

async function inspectEpochEvidence(state, orchestratorId) {
  const completed = [...state.results.values()].filter((result) => result.status === 'completed');
  if (!completed.length) return { reason: 'no_completed_worker_evidence' };
  const resolution = await verifiedResolution(state, orchestratorId);
  if (resolution) return { reason: 'verified_resolution', payload: resolutionPayload(resolution) };
  return { completed };
}

function resolutionPayload(resolution) {
  return { receiptId: resolution.receipt.receiptDigest || resolution.receipt.treeHash || null,
    verifierWorkerId: resolution.agentId };
}

function selectAndReserveEpoch(input) {
  const { state, orchestratorId, completed, selectRoundSurvivors, emitRoundEvaluated } = input;
  const continuation = state.plan.tokenPolicy.rounds?.continuation || {};
  const { survivors, paretoResult } = selectRoundSurvivors(completed, continuation, orchestratorId);
  if (!survivors.length) return { reason: 'no_admissible_survivors' };
  const settled = state.epoch ? budgetController.settleEpoch(state.epochBudget, state.epoch, 'evaluated') : state.epochBudget;
  if (settled.status === 'stopped') return { reason: settled.reason };
  const reservation = budgetController.reserveEpoch(settled, survivors.length);
  if (reservation.status !== 'reserved') {
    state.epochBudget = settled;
    return { reason: reservation.reason };
  }
  const epochPlan = { ...continuation, pool: reservation.reservedTokens };
  emitRoundEvaluated({ orchestratorId, state, survivors, paretoResult, continuation: epochPlan });
  return { survivors, continuation: epochPlan, settled, reservation };
}

async function reconfigureAndDispatchEpoch(input) {
  const { state, orchestratorId, survivors, continuation, reservation, settled } = input;
  let adaptation;
  let queued;
  let stage = 'morphogenesis_reconfiguration_failed';
  try {
    adaptation = await input.planAdaptiveContinuation({ state, survivors, continuation, orchestratorId });
    input.emitMorphogenesisContinuation(orchestratorId, adaptation);
    if (!adaptation.adapted && !mayContinueWithoutTransition(adaptation)) {
      state.epochBudget = budgetController.cancelEpochReservation(reservation.budget, reservation);
      return stopMorphogenesisEpochs({ ...input, reason: adaptation.reason || 'no_admissible_reconfiguration' });
    }
    stage = 'continuation_persistence_failed';
    queued = await prepareEpochContinuation({ ...input, state, survivors, continuation, adaptation, reservation });
  } catch (error) {
    state.epochBudget = budgetController.cancelEpochReservation(reservation.budget, reservation);
    return stopMorphogenesisEpochs({ ...input, reason: stage,
      payload: { error: error.message } });
  }
  for (const workerId of queued) input.dispatchPendingContinuation(workerId);
}

function mayContinueWithoutTransition(adaptation) {
  return ['adaptation_not_required', 'dedicated_a_team_continuation'].includes(adaptation.reason);
}

async function prepareEpochContinuation(input) {
  const { state, survivors, continuation, adaptation, orchestratorId, reservation, queueContinuationMissions } = input;
  const epoch = reservation.epoch;
  const nextContinuation = { ...continuation, pool: reservation.reservedTokens,
    survivorCount: survivors.length, perWorkerTokens: reservation.perWorkerTokens,
    workerTokens: reservation.workerTokens };
  const queued = await queueContinuationMissions(survivors.map((survivor, index) => ({
    state, survivor, continuation: nextContinuation, index, orchestratorId, adaptation, epoch
  })));
  state.epochBudget = reservation.budget;
  state.epoch = epoch;
  state.workerIds = new Set(queued);
  state.results = new Map();
  state.advanced = false;
  state.plan.morphogenesisEpochStatus = { status: 'running', epoch, maxEpochs: state.epochBudget.maxEpochs,
    budget: state.epochBudget, transition: adaptation.receipt || null };
  input.emit(orchestratorId, 'MORPHOGENESIS_EPOCH_STARTED', 'MORPHOGENESIS_EPOCH',
    `Started morphogenetic epoch ${epoch} with ${queued.length} worker(s).`,
    { epoch, workerIds: queued, reservedTokens: reservation.reservedTokens,
      topology: state.plan.selectedTopology || null, transition: adaptation.receipt || null }, 'info');
  return queued;
}

function stopMorphogenesisEpochs(input) {
  const { state, orchestratorId, reason, payload = {}, emit, autonomousRounds } = input;
  emit(orchestratorId, 'MORPHOGENESIS_EPOCHS_STOPPED', 'MORPHOGENESIS_EPOCH',
    `Morphogenetic epochs stopped: ${reason}.`, { reason, epoch: state.epoch,
      remainingTokens: state.epochBudget?.remaining ?? null,
      reservedEpochs: state.epochBudget?.reservedEpochs ?? 0,
      maxEpochs: state.epochBudget?.maxEpochs ?? null, ...payload },
    reason === 'verified_resolution' ? 'info' : 'warning');
  state.plan.morphogenesisEpochStatus = { status: reason === 'verified_resolution' ? 'resolved' : 'stopped', reason,
    completedEpochs: state.epoch, budget: state.epochBudget };
  autonomousRounds.delete(orchestratorId);
}

module.exports = { createMorphogenesisEpochCoordinator };
