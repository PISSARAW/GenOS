'use strict';

const budgetController = require('./morphogenesisEpochBudget');
const cohortComposer = require('./replacementCohortComposer');
const recruitment = require('./morphogenesisEpochRecruitment');
const { inspectEpochEvidence } = require('./morphogenesisEpochEvidence');
const RUNNING_STATUSES = new Set(['running', 'queued', 'claimed', 'freezing', 'thawing', 'cancelling']);
const QUIESCENT_STATUSES = new Set(['idle', 'blocked', 'completed', 'failed', 'unverified', 'error', 'terminated', 'apoptosis', 'quarantined']);
const { activeProcesses, missionStarts, pendingContinuations } = require('../agentOrchestrationState');
const { allocateNegotiatedWorkers } = require('./morphogenesisEpochFunding');

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

function selectAndReserveEpoch(input) {
  const { state, orchestratorId, completed, selectRoundSurvivors, emitRoundEvaluated } = input;
  const continuation = state.plan.tokenPolicy.rounds?.continuation || {};
  const { survivors, paretoResult } = selectRoundSurvivors(completed, continuation, orchestratorId);
  const settled = state.epoch ? budgetController.settleEpoch(state.epochBudget, state.epoch, 'evaluated') : state.epochBudget;
  if (settled.status === 'stopped') return { reason: settled.reason };
  const preferredSize = recruitment.preferredCohortSize(state, survivors.length);
  const reservation = recruitment.reserveCohortBudget(settled, preferredSize, budgetController);
  if (reservation.status !== 'reserved') {
    state.epochBudget = settled;
    return { reason: reservation.reason };
  }
  const epochPlan = { ...continuation, pool: reservation.reservedTokens,
    targetWorkerCount: reservation.targetWorkerCount };
  emitRoundEvaluated({ orchestratorId, state, survivors, paretoResult, continuation: epochPlan });
  return { survivors, continuation: epochPlan, settled, reservation };
}

async function reconfigureAndDispatchEpoch(input) {
  const { state, orchestratorId, survivors, continuation, reservation, settled } = input;
  let adaptation;
  let queued;
  let stage = 'morphogenesis_reconfiguration_failed';
  try {
    adaptation = await adaptEpochContinuation(input);
    if (!adaptation.adapted && !mayContinueWithoutTransition(adaptation)) {
      state.epochBudget = budgetController.cancelEpochReservation(reservation.budget, reservation);
      return stopMorphogenesisEpochs({ ...input, reason: adaptation.reason || 'no_admissible_reconfiguration' });
    }
    stage = 'continuation_persistence_failed';
    queued = await prepareFundedEpochContinuation(input, adaptation);
  } catch (error) {
    await releaseEpochReservation(input, adaptation);
    state.epochBudget = budgetController.cancelEpochReservation(reservation.budget, reservation);
    return stopMorphogenesisEpochs({ ...input, reason: stage,
      payload: { error: error.message } });
  }
  try {
    // Dispatch must settle before the admission reservation is released.
    // Historical contract: for (const workerId of queued) input.dispatchPendingContinuation(workerId)
    await Promise.all(queued.map((workerId) => input.dispatchPendingContinuation(workerId)));
  } catch (error) {
    await releaseEpochReservation(input, adaptation);
    state.epochBudget = budgetController.cancelEpochReservation(reservation.budget, reservation);
    return stopMorphogenesisEpochs({ ...input, reason: 'continuation_dispatch_failed',
      payload: { error: error.message } });
  }
  await releaseEpochReservation(input, adaptation);
}

async function releaseEpochReservation(input, adaptation) {
  try {
    await require('./morphogenesisRuntimeAdmission')
      .releaseAdmissionReservation(input.state.db, adaptation?.admission);
  } catch (_) {}
}

async function adaptEpochContinuation(input) {
  const { state, orchestratorId, survivors, continuation } = input;
  const quiescence = await assertDatabaseQuiescence(state, orchestratorId);
  const allowedTools = require('../agentOrchestrationState').orchestratorToolLease(state.plan);
  const strategyAdmissionContext = { quiescence, parentLease: { allowedTools },
    requestedTools: Array.isArray(state.plan?.requiredTools) ? state.plan.requiredTools : [] };
  const adaptation = await input.planAdaptiveContinuation({ state, survivors, continuation,
    orchestratorId, strategyAdmissionContext });
  input.emitMorphogenesisContinuation(orchestratorId, adaptation);
  return adaptation;
}

async function prepareFundedEpochContinuation(input, adaptation) {
  const { state, survivors, continuation, reservation } = input;
  const candidates = recruitment.candidateWorkers(adaptation, survivors, reservation.targetWorkerCount);
  const funded = allocateNegotiatedWorkers({ state, survivors: candidates, adaptation, reservation });
  if (!funded.survivors.length) {
    state.epochBudget = budgetController.cancelEpochReservation(reservation.budget, reservation);
    stopMorphogenesisEpochs({ ...input, reason: 'no_fundable_groups',
      payload: { resourceNegotiation: adaptation.decision?.resources || null } });
    return [];
  }
  disableUnfundedChallenge(adaptation, funded);
  const admission = await require('./morphogenesisEpochAdmissionCoordinator').validateFundedStrategy({
    input, adaptation, funded, reservation, assertQuiescence: assertDatabaseQuiescence
  });
  if (admission?.status === 'denied') {
    throw cohortError(`MORPHOGENESIS_STRATEGY_ADMISSION_DENIED:${admission.reason}`);
  }
  if (admission?.status === 'admitted') {
    adaptation.plan = admission.actualPlan;
    adaptation.admission = admission;
    if (adaptation.receipt) adaptation.receipt.strategyAdmission = admission;
  }
  const cohort = adaptation.cohortBlueprint
    ? await replaceEpochCohort({ ...input, state, funded, continuation, adaptation, reservation }) : null;
  const nextSurvivors = cohort ? recruitedSurvivors(cohort.workers, funded.survivors) : funded.survivors;
  if (cohort) remapRecruitmentAssignments(adaptation, nextSurvivors, state);
  return prepareEpochContinuation({ ...input, state, survivors: nextSurvivors,
    continuation: { ...continuation, workerTokens: cohort ? cohort.workers.map((worker) => worker.tokenBudget) : funded.workerTokens },
    adaptation, reservation, cohort });
}

function disableUnfundedChallenge(adaptation, funded) {
  const challenge = adaptation.decision?.challenge;
  if (challenge?.status !== 'challenge_authorized') return;
  const fundedIds = new Set(funded.survivors.map((worker) => worker.agentId));
  if (hasFundedChallengeAlternative(adaptation, fundedIds)) return;
  const reserve = Number(challenge.challenge?.reservedTokens || 0);
  challenge.status = 'challenge_not_funded';
  challenge.challenge = { ...challenge.challenge, reservedTokens: 0 };
  clearStrategyChallenges(adaptation.assignments, adaptation.cohortBlueprint);
  refundChallengeReserve(funded, reserve);
}

function hasFundedChallengeAlternative(adaptation, fundedIds) {
  const blueprintAssignments = adaptation.cohortBlueprint?.assignments || [];
  if (blueprintAssignments.length) return blueprintAssignments.some((assignment, index) =>
    fundedIds.has(assignment.candidateId || assignment.sourceAgentId || `cohort-slot-${index + 1}`)
      && assignment.strategyChallenge && assignment.morphologyTopology !== adaptation.plan?.selectedTopology);
  return Object.entries(adaptation.assignments || {}).some(([workerId, assignment]) =>
    fundedIds.has(workerId) && assignment.strategyChallenge
      && assignment.morphologyTopology !== adaptation.plan?.selectedTopology);
}

function clearStrategyChallenges(assignments = {}, blueprint = null) {
  for (const assignment of Object.values(assignments)) delete assignment.strategyChallenge;
  for (const assignment of blueprint?.assignments || []) delete assignment.strategyChallenge;
}

function refundChallengeReserve(funded, reserve) {
  if (!reserve || !funded.workerTokens.length) return;
  const each = Math.floor(reserve / funded.workerTokens.length);
  const remainder = reserve - each * funded.workerTokens.length;
  funded.workerTokens = funded.workerTokens.map((tokens, index) => tokens + each + (index === 0 ? remainder : 0));
}

async function assertDatabaseQuiescence(state, orchestratorId) {
  const ids = [...state.workerIds];
  if (!ids.length) throw cohortError('MORPHOGENESIS_COHORT_NOT_QUIESCENT');
  assertLocalQuiescence(ids);
  const marks = ids.map(() => '?').join(',');
  const rows = await state.db.all(`SELECT a.id, a.status, a.runtime_pid,
    EXISTS (SELECT 1 FROM garage_queue q WHERE q.worker_id = a.id
      AND (q.status IN ('queued', 'claimed', 'running') OR q.phase IN ('frozen', 'thawing', 'freezing', 'freeze_failed', 'cancelling'))) AS leased
    FROM agents a WHERE a.parent_agent_id = ? AND a.id IN (${marks})`, orchestratorId, ...ids);
  assertDatabaseRowsQuiescent(rows, ids.length);
  return { confirmed: true, observedAt: Date.now(), activeProcesses: 0,
    databaseRunningWorkers: rows.filter((row) => RUNNING_STATUSES.has(String(row.status || '').toLowerCase())).length,
    activeLeases: rows.filter((row) => Number(row.leased) !== 0).length };
}

function assertDatabaseRowsQuiescent(rows, expected) {
  if (!Array.isArray(rows) || rows.length !== expected || rows.some((row) => !isQuiescentRow(row))) {
    throw cohortError('MORPHOGENESIS_COHORT_NOT_QUIESCENT');
  }
}

function isQuiescentRow(row) {
  const status = String(row.status || '').toLowerCase();
  return QUIESCENT_STATUSES.has(status) && !RUNNING_STATUSES.has(status)
    && !row.runtime_pid && Number(row.leased) === 0;
}

function assertLocalQuiescence(ids) {
  for (const id of ids) {
    if (activeProcesses.has(id) || missionStarts.has(id) || pendingContinuations.has(id)) {
      throw cohortError('MORPHOGENESIS_COHORT_NOT_QUIESCENT');
    }
  }
}

function cohortError(code) { return Object.assign(new Error(code), { code }); }

async function replaceEpochCohort(input) {
  const { state, funded, continuation, adaptation, reservation, orchestratorId } = input;
  const prior = [...state.workerIds].map((id) => ({ id, status: 'completed' }));
  const blueprint = fundedBlueprint(adaptation.cohortBlueprint, funded);
  const composed = cohortComposer.composeReplacementCohort({
    missionId: state.normalizedMission.missionId || orchestratorId, parentId: orchestratorId,
    epoch: reservation.epoch, topology: adaptation.plan?.selectedTopology || state.plan.selectedTopology,
    variant: adaptation.plan?.selectedVariant, executionPath: state.plan.trinity?.activated ? 'trinity' : 'morphogenesis',
    quiescence: { confirmed: true }, mission: state.normalizedMission, currentCohort: prior,
    remainingBudget: { tokens: reservation.reservedTokens }, parentAuthority: parentAuthority(state), blueprint
  });
  const workers = await persistCohortWorkers({ state, orchestratorId, composed, funded, continuation });
  if (workers.length !== composed.workers.length) throw cohortError('MORPHOGENESIS_COHORT_PERSIST_FAILED');
  const enrolled = workers.map((worker, index) => ({ ...worker, tokenBudget: funded.workerTokens[index],
    cohortId: composed.cohortId, cohortEpoch: reservation.epoch }));
  state.morphogenesisCohorts = [...(state.morphogenesisCohorts || []),
    { cohortId: composed.cohortId, epoch: reservation.epoch, topology: composed.topology,
      workerIds: enrolled.map((worker) => worker.agentId), predecessorIds: composed.retireWorkerIds }];
  state.currentCohortId = composed.cohortId;
  return { ...composed, workers: enrolled };
}

function fundedBlueprint(blueprint, funded) {
  if (!blueprint?.assignments?.length) throw cohortError('MORPHOGENESIS_COHORT_BLUEPRINT_EMPTY');
  const assignments = funded.survivors.map((survivor, index) => {
    const blueprintEntry = recruitment.cohortAssignment(blueprint, survivor, index);
    return { ...blueprintEntry, tokenBudget: funded.workerTokens[index] };
  });
  return { assignments };
}

function parentAuthority(state) {
  const plan = state.plan;
  if (!plan) throw cohortError('MORPHOGENESIS_PARENT_AUTHORITY_UNAVAILABLE');
  const allowedTools = require('../agentOrchestrationState').orchestratorToolLease(plan);
  if (!Array.isArray(allowedTools) || !allowedTools.length) {
    throw cohortError('MORPHOGENESIS_PARENT_AUTHORITY_UNAVAILABLE');
  }
  const mission = state.normalizedMission || {};
  const write = mission.writeLease === true || (mission.executionPolicy?.allowFileEdits === true
    && mission.workspaceProvisioned === true);
  return { read: true, analyze: true, execute: true, write, promote: false, allowedTools };
}

async function persistCohortWorkers(context) {
  const { state, orchestratorId, composed, funded, continuation } = context;
  const parent = await state.db.get('SELECT agent_type FROM agents WHERE id = ?', orchestratorId);
  if (!parent) throw cohortError('MORPHOGENESIS_ORCHESTRATOR_MISSING');
  const assignments = composed.workers.map(({ id, ...worker }) => ({ ...worker, workerId: id }));
  const tokens = assignments.map((worker) => worker.tokenBudget);
  const workers = await require('../agentFleetService').createAutonomousWorkers(state.db,
    { id: orchestratorId, agent_type: parent.agent_type }, {
      plan: { morphogenesisCohort: true, dispatchWorkers: assignments,
        tokenPolicy: { total: reservationPool(context), workerShare: 1,
          rounds: { initial: { workerTokens: tokens, perWorkerTokens: continuation.perWorkerTokens } } } },
      mission: state.normalizedMission
    });
  for (const worker of workers) state.workers.set(worker.agentId, worker);
  return workers;
}

function reservationPool(context) {
  return context.funded.workerTokens.reduce((sum, value) => sum + value, 0);
}

function recruitedSurvivors(workers, sources) {
  return workers.map((worker, index) => {
    const source = sources[index % sources.length] || {};
    return { agentId: worker.agentId, candidateId: source.candidateId || source.agentId,
      sourceAgentId: source.sourceAgentId || null, status: 'completed',
      sourceAssignment: source, payload: source.sourceEvidence || source.payload || {} };
  });
}

function remapRecruitmentAssignments(adaptation, survivors, state) {
  const mapped = {};
  for (const survivor of survivors) {
    const assignment = adaptation.cohortBlueprint?.assignments?.find((entry) =>
      entry.candidateId === survivor.candidateId) || adaptation.assignments?.[survivor.sourceAgentId];
    if (!assignment) continue;
    mapped[survivor.agentId] = { ...assignment };
    const worker = state.workers.get(survivor.agentId);
    if (worker) worker.strategyChallenge = assignment.strategyChallenge || null;
  }
  adaptation.assignments = mapped;
  if (adaptation.receipt) adaptation.receipt.rebinds = Object.entries(mapped).map(([workerId, assignment]) => ({
    workerId, nodeId: assignment.morphologyNodeId, topology: assignment.morphologyTopology,
    role: assignment.role, workerKind: assignment.workerKind
  }));
}

function mayContinueWithoutTransition(adaptation) {
  return ['adaptation_not_required', 'dedicated_a_team_continuation'].includes(adaptation.reason);
}

async function prepareEpochContinuation(input) {
  const { state, survivors, continuation, adaptation, orchestratorId, reservation, queueContinuationMissions } = input;
  const epoch = reservation.epoch;
  reconcileResourceEffect(adaptation, survivors, continuation);
  const transition = adaptation.receipt
    ? require('./morphogenesisTransitionReceipt').sealTransitionReceipt({ state, survivors,
      continuation, adaptation }) : null;
  const epochBudget = refundUnspentEpochBudget(reservation.budget, reservation,
    continuation.workerTokens || reservation.workerTokens);
  const nextContinuation = { ...continuation, pool: reservation.reservedTokens,
    survivorCount: survivors.length, perWorkerTokens: reservation.perWorkerTokens,
    workerTokens: continuation.workerTokens || reservation.workerTokens, epochBudgetSnapshot: epochBudget };
  const queued = await queueContinuationMissions(survivors.map((survivor, index) => ({
    state, survivor, continuation: nextContinuation, index, orchestratorId, adaptation, epoch
  })));
  if (transition) require('./morphogenesisTransitionReceipt').finalizeTransitionQueue(transition, queued,
    queued.map((workerId) => pendingContinuations.get(workerId)));
  state.epochBudget = epochBudget;
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

function reconcileResourceEffect(adaptation, survivors, continuation) {
  const effect = adaptation.receipt?.resourceAllocationEffect;
  if (effect?.status !== 'applied') return;
  const tokens = continuation.workerTokens || [];
  if (tokens.length !== survivors.length || tokens.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw cohortError('MORPHOGENESIS_RESOURCE_EFFECT_WORKERS_DIVERGED');
  }
  effect.workerTokenAllocations = survivors.map((worker, index) => ({
    workerId: worker.agentId, tokens: tokens[index]
  })).sort((left, right) => left.workerId.localeCompare(right.workerId));
  effect.allocatedTokens = tokens.reduce((sum, value) => sum + value, 0);
}

function refundUnspentEpochBudget(budget, reservation, workerTokens) {
  const spent = workerTokens.reduce((sum, tokens) => sum + Number(tokens || 0), 0);
  const refund = Math.max(0, reservation.reservedTokens - spent);
  return refund ? { ...budget, remaining: budget.remaining + refund } : budget;
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
