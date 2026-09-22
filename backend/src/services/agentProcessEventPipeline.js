const { decodeEvents, MAX_FRAME_BYTES } = require('./runtimeProtocol');
const strategyExecution = require('./strategyExecutionService');
const hallucinationMonitor = require('./hallucinationMonitoringService');
const resilienceService = require('./resilienceService');
const { extractEvidenceReport, validateDossierInfluence } = require('./agentEvidenceService');
const { advanceAutonomousRound, dispatchPendingContinuation } = require('./agentRoundService');
const { dispatchWorkerRecovery } = require('./agentRecoveryService');
const agentConscience = require('./agentConscienceService');
const cognitiveMonitor = require('./cognitiveMonitor');
const swarmSentinel = require('./swarmSentinelService');
const { clearTerminationTimer } = require('./processTermination');
const { finalizeChildClose } = require('./agentProcessOutcome');
const { activeProcesses, emit, updateAgent } = require('./agentOrchestrationState');
const workspaceLifecycle = require('./agentWorkspaceLifecycleService');
const workerGarage = require('./workerGarageService');
const { checkNaturalSearchControl, clearSearchState } = require('./search/naturalSearchRuntime');

function applyDomainStateFromEvent(state, event, eventType) {
  if (eventType === 'EVIDENCE_REPORT') {
    try {
      const report = extractEvidenceReport(event.payload);
      if (report) {
        if (report.outcome === 'success') {
          state.missionDomainState.unverified = false;
          state.missionDomainState.domainVerdict = 'completed';
        } else {
          state.missionDomainState.hasDomainFailure = true;
          state.missionDomainState.domainVerdict = 'failed';
        }
      }
    } catch (_) {}
  }
  if (['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(eventType)) {
    state.missionDomainState.hasDomainFailure = true;
    state.missionDomainState.domainVerdict = 'failed';
  }
}

function checkDossierInfluence(ctx, event, eventType) {
  const { agentId, dispatchedAgent, autonomyPlan } = ctx;
  if (eventType !== 'EVIDENCE_REPORT' || dispatchedAgent.execution_mode !== 'orchestrator' || !autonomyPlan?.synthesisOnly) return false;
  try {
    const report = extractEvidenceReport(event.payload);
    validateDossierInfluence(report, autonomyPlan.completedWorkerIds || []);
    return false;
  } catch (error) {
    emit(agentId, 'DOSSIER_INFLUENCE_INVALID', 'EVIDENCE_GATE', error.message, { error: error.code }, 'critical', 'error');
    ctx.haltRuntime(ctx, 'evidence_gate', error.message, 'Runtime halted because the final synthesis did not account for every worker dossier.', { error: error.code });
    return true;
  }
}

async function checkHallucination(ctx, event, observation) {
  const { agentId } = ctx;
  const eventType = event.eventType;
  if (!(observation.monitored && observation.detected)) return false;
  emit(agentId, 'HALLUCINATION_DETECTED', 'EVIDENCE_GATE', observation.reasons.join('; '), {
    sourceEventId: event.id, sourceEventType: eventType, total: observation.total, reasons: observation.reasons
  }, 'warning');
  const autopsy = await resilienceService.evaluateApoptosis(agentId, { hallucinations: observation.total }, ctx.db);
  if (autopsy.apoptosisExecuted && !ctx.state.termination) {
    emit(agentId, 'APOPTOSIS_TRIGGERED', 'HALLUCINATION_LIMIT', autopsy.triggerReason, { autopsy }, 'critical', 'apoptosis');
    ctx.haltRuntime(ctx, 'apoptosis', autopsy.triggerReason, 'Runtime halted after the hallucination limit was reached.', { autopsy });
    return true;
  }
  return false;
}

function checkStrategyGuardrail(ctx, event, decision) {
  const { agentId, executionRun } = ctx;
  const finalEvent = isFinalEvent(event.eventType, event);
  if (!(decision?.halt && !ctx.state.termination && !finalEvent)) return;
  emit(agentId, 'STRATEGY_GUARDRAIL_BLOCKED', 'HALT', decision.reason, { runId: executionRun.id }, 'critical', 'error');
  ctx.haltRuntime(ctx, 'guardrail', decision.reason, 'Runtime halted by the strategy execution guardrail.', { runId: executionRun.id });
}

function checkSwarmSentinel(ctx, event, finalEvent) {
  const { agentId } = ctx;
  const sentinelResult = swarmSentinel.inspectEvent(agentId, event);
  if (sentinelResult.intervention && !ctx.state.termination && !finalEvent) {
    emit(agentId, 'SWARM_ENTROPY_COLLAPSE', 'SENTINEL_HALT', sentinelResult.reason, {
      state: sentinelResult.state, normalizedEntropy: sentinelResult.normalizedEntropy
    }, 'critical', 'deadlock_collapse');
    ctx.haltRuntime(ctx, 'deadlock_collapse', sentinelResult.reason, 'Runtime halted: Swarm Sentinel detected infinite cognitive repetition / deadlock.', { sentinelResult });
    return true;
  }
  if (sentinelResult.action === 'WARN_SPIKE') {
    emit(agentId, 'SWARM_ENTROPY_SPIKE', 'ENTROPY_WARNING', sentinelResult.reason, {
      state: sentinelResult.state, normalizedEntropy: sentinelResult.normalizedEntropy
    }, 'warning');
  }
  return false;
}

function resolveInteractionParties(agentId, event) {
  const msgRecipient = event.payload?.recipient || event.payload?.targetAgentId || event.recipient;
  const msgSender = event.payload?.sender || event.sender || (msgRecipient ? agentId : null);
  return { msgSender, msgRecipient };
}

function eventHasDiff(event) {
  return Boolean(event.payload?.hasDiff || event.payload?.diff || event.hasDiff);
}

function checkInteractionDeadlock(ctx, event, finalEvent) {
  const { agentId } = ctx;
  const { msgSender, msgRecipient } = resolveInteractionParties(agentId, event);
  if (!(msgSender && msgRecipient && msgSender !== msgRecipient)) return false;
  const deadlockStatus = swarmSentinel.recordInteraction(msgSender, msgRecipient, eventHasDiff(event));
  if (deadlockStatus?.deadlockDetected && !ctx.state.termination && !finalEvent) {
    emit(agentId, 'SWARM_INTERACTION_DEADLOCK', 'SENTINEL_HALT', deadlockStatus.recommendation, {
      circularDeadlocks: deadlockStatus.circularDeadlocks,
      chattyLoops: deadlockStatus.chattyLoops
    }, 'critical', 'deadlock_collapse');
    ctx.haltRuntime(ctx, 'deadlock_collapse', deadlockStatus.recommendation, 'Runtime halted: Swarm Sentinel detected circular inter-agent deadlock or chatty loop.', { deadlockStatus });
    return true;
  }
  return false;
}

function classifyConscienceEvent(event, eventType, observation) {
  const isHallucinationEvent = Boolean(observation?.monitored && observation?.detected);
  const isErrorEvent = ['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(eventType)
    || (event.severity === 'error' && !['EVIDENCE_REPORT', 'DOSSIER_INFLUENCE_VERIFIED'].includes(eventType));
  const isSuccessEvent = ['EVIDENCE_REPORT', 'DOSSIER_INFLUENCE_VERIFIED'].includes(eventType)
    && event.severity !== 'error'
    && !isHallucinationEvent;
  return { isHallucinationEvent, isErrorEvent, isSuccessEvent };
}

function buildCognitiveHealth(event, isHallucinationEvent) {
  const detailText = String(event.detail || '') + ' ' + (typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload || {}));
  const cognitiveHealth = cognitiveMonitor.evaluateCognitiveHealth(detailText);
  if (isHallucinationEvent) {
    cognitiveHealth.semantic_drift = Math.max(cognitiveHealth.semantic_drift || 0, 1.0);
    cognitiveHealth.health_score = Math.min(cognitiveHealth.health_score ?? 1.0, 0.2);
  }
  return cognitiveHealth;
}

async function runConscienceCheck(ctx, event, observation) {
  const { db, agentId, conscienceState } = ctx;
  const eventType = event.eventType;
  const { isHallucinationEvent, isErrorEvent, isSuccessEvent } = classifyConscienceEvent(event, eventType, observation);
  if (isErrorEvent || isHallucinationEvent) {
    const cognitiveHealth = buildCognitiveHealth(event, isHallucinationEvent);
    const evalResult = agentConscience.evaluateBranch(conscienceState, {
      errorsInLoop: isErrorEvent ? 1 : 0,
      cognitiveHealth
    });
    emit(agentId, 'CONSCIENCE_STATE_UPDATED', 'CONSCIENCE', `Dissonance cognitive augmentée à ${conscienceState.dissonanceLevel.toFixed(1)}.`, { conscienceState }, 'warning');
    if (evalResult.apoptoticTriggered && !ctx.state.termination) {
      emit(agentId, 'COGNITIVE_APOPTOSIS', 'CONSCIENCE_LIMIT', `Dissonance cognitive critique (${conscienceState.dissonanceLevel.toFixed(1)} >= ${conscienceState.maxDissonanceThreshold}). Apoptose déclenchée.`, { conscienceState }, 'critical', 'apoptosis');
      await agentConscience.persistConscienceState(db, agentId, conscienceState, { reason: 'cognitive_apoptosis' });
      ctx.haltRuntime(ctx, 'cognitive_apoptosis', 'Dissonance cognitive critique.', 'Runtime halted by Cognitive Conscience Apoptosis.', { conscienceState });
      return true;
    }
    await agentConscience.persistConscienceState(db, agentId, conscienceState, { reason: isHallucinationEvent ? 'supervisor_hallucination' : 'supervisor_error' });
    return false;
  }
  if (isSuccessEvent) {
    agentConscience.triggerEureka(conscienceState);
    emit(agentId, 'COGNITIVE_EUREKA', 'EUREKA', `Événement Eurêka enregistré ! Dissonance réduite à ${conscienceState.dissonanceLevel.toFixed(1)}.`, { conscienceState }, 'info');
    await agentConscience.persistConscienceState(db, agentId, conscienceState, { reason: 'supervisor_eureka' });
  }
  return false;
}

function isFinalEvent(eventType, event) {
  return ['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN'].includes(eventType) || event.action === 'VERIFY';
}

async function processEventQueueImpl(ctx) {
  const { db, agentId, normalizedMission, state } = ctx;
  if (state.isProcessingEvents) return;
  state.isProcessingEvents = true;
  while (state.eventQueue.length > 0) {
    const currentEvent = state.eventQueue.shift();
    try {
      const decision = await strategyExecution.recordExecutionEvent(db, agentId, currentEvent);
      const eventType = currentEvent.eventType;
      const finalEvent = isFinalEvent(eventType, currentEvent);
      applyDomainStateFromEvent(state, currentEvent, eventType);
      const observation = await hallucinationMonitor.recordObservation(db, currentEvent);
      if (checkDossierInfluence(ctx, currentEvent, eventType)) continue;
      if (await checkHallucination(ctx, currentEvent, observation)) continue;
      checkStrategyGuardrail(ctx, currentEvent, decision);
      if (checkSwarmSentinel(ctx, currentEvent, finalEvent)) continue;
      if (checkInteractionDeadlock(ctx, currentEvent, finalEvent)) continue;
      if (await runConscienceCheck(ctx, currentEvent, observation)) continue;
      if (await checkNaturalSearchControl(ctx, currentEvent, finalEvent)) continue;
      await advanceAutonomousRound(normalizedMission, currentEvent);
    } catch (err) {
      console.error('Error processing event', err);
    }
  }
  state.isProcessingEvents = false;
}

function parseEventPayload(event) {
  try {
    return event.payloadJson ? JSON.parse(event.payloadJson) : {};
  } catch {
    return { raw: event.payloadJson };
  }
}

function enqueueStatusUpdate(ctx, event, nextStatus) {
  if (!(nextStatus || event.currentTask)) return;
  if (event.eventType === 'AGENT_COMPLETED' && !event.status) return;
  ctx.state.executionQueue = ctx.state.executionQueue.then(() => { return updateAgent(ctx.agentId, nextStatus, event.currentTask); });
}

function handleDecodedEvent(ctx, event) {
  const payload = parseEventPayload(event);
  const nextStatus = event.status;
  if (['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'AGENT_HALTED', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN', 'MISSION_NO_ANSWER_PROVEN'].includes(event.eventType)) {
    ctx.state.terminalEventSeen = true;
  }
  enqueueStatusUpdate(ctx, event, nextStatus);
  ctx.emitTracked(event.eventType || 'AGENT_STEP', event.action || 'EXECUTE', event.detail || '', payload, event.severity || 'info', nextStatus);
}

function handleStdoutData(ctx, chunk) {
  const { state } = ctx;
  state.stdoutBuffer = Buffer.concat([state.stdoutBuffer, chunk]);
  if (state.stdoutBuffer.length > MAX_FRAME_BYTES + 4) {
    ctx.haltRuntime(ctx, 'protocol', `Runtime event buffer exceeds ${MAX_FRAME_BYTES} bytes.`, 'Runtime halted after an oversized or incomplete event frame.');
    state.stdoutBuffer = Buffer.alloc(0);
    return;
  }
  try {
    state.stdoutBuffer = decodeEvents(state.stdoutBuffer, (event) => { handleDecodedEvent(ctx, event); });
  } catch (error) {
    ctx.haltRuntime(ctx, 'protocol', error.message, 'Runtime halted after an invalid event frame.');
    state.stdoutBuffer = Buffer.alloc(0);
  }
}

function handleStderrData(ctx, chunk) {
  const { state } = ctx;
  const detail = chunk.toString();
  state.stderrBuffer = `${state.stderrBuffer}${detail}`.slice(-4000);
  if (detail.trim()) ctx.emitTracked('AGENT_RUNTIME_LOG', 'STDERR', detail.trim(), {}, 'warning');
}

function handleStdinError(ctx, error) {
  ctx.emitTracked('AGENT_RUNTIME_ERROR', 'STDIN', error.message, {}, 'error', 'error');
}

async function handleChildError(ctx, error) {
  try {
    if (ctx.state.termination) return;
    ctx.state.terminalEventSeen = true;
    await updateAgent(ctx.agentId, 'error', error.message);
    ctx.emitTracked('AGENT_RUNTIME_ERROR', 'ERROR', error.message, {}, 'error', 'error');
  } catch (err) {
    console.error(`[AgentSupervisor] Error handling child process error for ${ctx.agentId}:`, err);
  }
}

async function handleChildClose(ctx, code, signal) {
  const { agentId, state } = ctx;
  try {
    clearTerminationTimer(ctx.child);
    await state.executionQueue;
    const drainDeadline = Date.now() + 30000;
    while ((state.isProcessingEvents || state.eventQueue.length > 0) && Date.now() < drainDeadline) {
      await new Promise((resolve) => { setImmediate(resolve); });
    }
  } catch (err) {
    console.error(`[AgentSupervisor] Error draining event queue for ${agentId}:`, err);
  } finally {
    activeProcesses.delete(agentId);
    swarmSentinel.clearAgent(agentId);
    await clearSearchState(agentId);
  }

  try {
    await finalizeChildClose({
      db: ctx.db, agentId, dispatchedAgent: ctx.dispatchedAgent, normalizedMission: ctx.normalizedMission, child: ctx.child, code, signal, stderrBuffer: state.stderrBuffer,
      termination: state.termination, missionDomainState: state.missionDomainState, terminalEventSeen: state.terminalEventSeen, emitTracked: ctx.emitTracked, executionQueue: state.executionQueue,
      workspaceLifecycle, workerGarage, emit, updateAgent
    });
  } catch (err) {
    console.error(`[AgentSupervisor] Error finalizing agent process close for ${agentId}:`, err);
    try {
      await updateAgent(agentId, 'error', `Runtime finalization failed: ${err.message}`);
      ctx.emitTracked('AGENT_FINALIZATION_ERROR', 'FINALIZATION', err.message, { code, signal, stack: err.stack }, 'error', 'error');
    } catch (persistErr) {
      console.error(`[AgentSupervisor] Could not persist finalization failure for ${agentId}:`, persistErr);
      process.stderr.write(`[AgentSupervisor] CRITICAL: Could not persist finalization failure for ${agentId}: ${persistErr.message}\n`);
    }
  } finally {
    try {
      await dispatchWorkerRecovery(agentId);
    } catch (err) {
      console.error(`[AgentSupervisor] Error dispatching worker recovery for ${agentId}:`, err);
    }
    try {
      dispatchPendingContinuation(agentId);
    } catch (err) {
      console.error(`[AgentSupervisor] Error dispatching pending continuation for ${agentId}:`, err);
    }
  }
}

module.exports = {
  applyDomainStateFromEvent, checkDossierInfluence, checkHallucination, checkStrategyGuardrail,
  checkSwarmSentinel, checkInteractionDeadlock, classifyConscienceEvent, buildCognitiveHealth,
  runConscienceCheck, isFinalEvent, processEventQueueImpl, handleDecodedEvent, handleStdoutData,
  handleStderrData, handleStdinError, handleChildError, handleChildClose, checkNaturalSearchControl,
  clearSearchState
};
