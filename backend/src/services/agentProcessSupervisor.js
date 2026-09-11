/**
 * Process supervision for one agent runtime: spawns the framed-protobuf child,
 * decodes its event stream into telemetry, guardrails, and orchestration
 * decisions, and translates the exit into a terminal agent outcome.
 */
const path = require('path');
const { spawn } = require('child_process');
const { encodeMission, decodeEvents, MAX_FRAME_BYTES } = require('./runtimeProtocol');
const { resolveExecutable, isLocalRuntime } = require('./agentRuntimeExecutable');
const modelRouter = require('./modelRouter');
const localModelDiscovery = require('./localModelDiscovery');
const strategyExecution = require('./strategyExecutionService');
const hallucinationMonitor = require('./hallucinationMonitoringService');
const resilienceService = require('./resilienceService');
const { decideFromEvent } = require('./orchestrationDecisionService');
const actionExecutor = require('./orchestrationActionExecutor');
const userProgress = require('./userProgressService');
const workerGarage = require('./workerGarageService');
const {
  activeProcesses, activeWorkerBarriers, workerEvidenceRounds, emit, updateAgent
} = require('./agentOrchestrationState');
const { recordWorkerEvidence, validateDossierInfluence, extractEvidenceReport, hasDecisionEvidence, decisionEvidenceFailure } = require('./agentEvidenceService');
const { advanceAutonomousRound, dispatchPendingContinuation } = require('./agentRoundService');
const { queueWorkerRecovery, dispatchWorkerRecovery, applyOrganizationDecision } = require('./agentRecoveryService');
const workspaceLifecycle = require('./agentWorkspaceLifecycleService');
const agentConscience = require('./agentConscienceService');
const cognitiveMonitor = require('./cognitiveMonitor');
const swarmSentinel = require('./swarmSentinelService');
const { terminateChild, clearTerminationTimer } = require('./processTermination');
const {
  buildRuntimeEnvironment,
  buildReplayManifest,
  runtimeExitOutcome,
  finalizeChildClose
} = require('./agentProcessOutcome');

async function superviseMission(options) {
  const { db, agentId, normalizedMission, dispatchedAgent, contractRecord, executionRun, autonomyPlan, runtimeBudget, runtimeEnvironment, silentUpdates, genosCapsule, executable } = options;
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const conscienceState = await agentConscience.loadConscienceState(db, agentId);
  // Keep the default stable regardless of whether `npm start` was launched from
  // the repository root or from backend/.
  const workspaceRoot = normalizedMission.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const resolvedExecutable = resolveExecutable(executable, workspaceRoot);
  let spawnCmd = resolvedExecutable;
  let spawnArgs = [];
  if (resolvedExecutable.endsWith('.cjs') || resolvedExecutable.endsWith('.js')) {
    spawnCmd = 'node';
    spawnArgs = [resolvedExecutable];
  }
  const child = spawn(spawnCmd, spawnArgs, {
    cwd: workspaceRoot,
    env: buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, silentUpdates),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  const runtimeStartedAt = new Date().toISOString();
  activeProcesses.set(agentId, child);
  await db.run('UPDATE agents SET runtime_pid = ?, runtime_started_at = ?, runtime_executable = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', child.pid, runtimeStartedAt, spawnCmd, agentId);
  // Disposable capsules (git worktrees or copies) are reclaimed after the
  // mission ends; a caller-provided workspace is never tracked.
  if (normalizedMission.workspaceProvisioned === true || dispatchedAgent.execution_mode === 'orchestrator') {
    await workspaceLifecycle.trackWorkspace(agentId, workspaceRoot);
  }
  // This marker distinguishes a deliberate control-plane stop from a runtime
  // failure.  SIGTERM makes a child exit non-zero on many platforms, so the
  // close handler must not turn our own guardrail into AGENT_FAILED.
  let termination = null;
  let executionQueue = Promise.resolve();
  let missionDomainState = { hasDomainFailure: false, unverified: true, domainVerdict: 'unverified' };
  const haltRuntime = (kind, reason, detail, payload = {}) => {
    if (termination) return false;
    termination = { kind, reason };
    emit(agentId, 'AGENT_RUNTIME_HALT_REQUESTED', kind.toUpperCase(), detail, { reason, ...payload }, 'critical', 'blocked');
    terminateChild(child);
    return true;
  };
  const emitTracked = (eventType, action, detail, payload = {}, severity = 'info', status) => {
    const eventPayload = {
      ...payload,
      executionRunId: payload.executionRunId || executionRun.id,
      contractId: payload.contractId || contractRecord.id,
      contractVersion: payload.contractVersion || contractRecord.version
    };
    const event = emit(agentId, eventType, action, detail, eventPayload, severity, status);
    recordWorkerEvidence(normalizedMission, event);
    const userMilestone = userProgress.milestoneFromEvent(event, {
      agentId,
      agentName: normalizedMission.name || dispatchedAgent.name,
      task: normalizedMission.prompt || normalizedMission.currentTask
    });
    if (userMilestone) {
      userProgress.report({
        orchestratorId: normalizedMission.orchestratorAgentId || agentId,
        sourceAgentId: agentId,
        ...userMilestone,
        silent: silentUpdates
      });
    }
    const workerFailure = dispatchedAgent.execution_mode === 'worker'
      && ['WORKER_TASK_FAILED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(eventType);
    if (workerFailure) queueWorkerRecovery(normalizedMission, event);
    if (dispatchedAgent.execution_mode === 'worker' && eventType === 'WORKER_NO_ANSWER_PROVEN') {
      const report = workerRecovery.failureReport(event, normalizedMission);
      const decision = workerRecovery.decideRecovery(report);
      emit(dispatchedAgent.parent_agent_id, 'WORKER_NO_ANSWER_ACCEPTED', 'CONCLUDE_NO_ANSWER', decision.reason, {
        workerId: agentId, proof: report.noAnswerProof
      }, 'info');
    }
    const decision = workerFailure || !hasDecisionEvidence(event) ? null : decideFromEvent(event);
    if (!workerFailure && !hasDecisionEvidence(event)) {
      emit(normalizedMission.orchestratorAgentId || agentId, 'ORCHESTRATION_DECISION_BLOCKED', 'EVIDENCE_GATE', decisionEvidenceFailure(event), {
        sourceAgentId: agentId, sourceEvent: eventType
      }, 'warning', 'blocked');
    }
    if (decision) {
      db.get('SELECT parent_agent_id FROM agents WHERE id = ?', agentId).then((agent) => {
        const ownerId = agent?.parent_agent_id || agentId;
        emit(ownerId, 'ORCHESTRATION_DECISION', decision.action, decision.reason, { sourceAgentId: agentId, sourceEvent: eventType, ...decision }, 'info');
        if (decision.organization) applyOrganizationDecision(ownerId, decision.organization, decision.reason).catch(() => {});
        actionExecutor.execute({ orchestratorId: ownerId, sourceAgentId: agentId, decision, event, workspaceRoot }).catch(() => {});
      }).catch(() => {});
    }
    eventQueue.push(event);
    if (eventQueue.length > maxEventQueue) {
      eventQueue.shift();
      droppedEventCount += 1;
      emit(agentId, 'RUNTIME_EVENT_QUEUE_OVERFLOW', 'QUEUE_DROP', `Runtime event queue dropped ${droppedEventCount} event(s) after reaching capacity ${maxEventQueue}.`, {
        droppedEventCount,
        capacity: maxEventQueue,
        droppedEventType: event.eventType
      }, 'critical', 'error');
      haltRuntime('event_queue_overflow', 'Runtime event queue capacity exceeded.', 'Runtime halted because event persistence could no longer keep up with the child process.', { droppedEventCount, capacity: maxEventQueue });
    }
    processEventQueue();
    return event;
  };

  const eventQueue = [];
  const maxEventQueue = Math.max(1, Number(process.env.GENOS_RUNTIME_EVENT_QUEUE_CAPACITY) || 2048);
  let droppedEventCount = 0;
  let isProcessingEvents = false;
  const processEventQueue = async () => {
    if (isProcessingEvents) return;
    isProcessingEvents = true;
    while (eventQueue.length > 0) {
      const currentEvent = eventQueue.shift();
      try {
        const decision = await strategyExecution.recordExecutionEvent(db, agentId, currentEvent);
        const eventType = currentEvent.eventType;
        const finalEvent = ['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN'].includes(eventType) || currentEvent.action === 'VERIFY';
        if (eventType === 'EVIDENCE_REPORT') {
          try {
            const report = extractEvidenceReport(currentEvent.payload);
            if (report) {
              if (report.outcome === 'success') {
                missionDomainState.unverified = false;
                missionDomainState.domainVerdict = 'completed';
              } else {
                missionDomainState.hasDomainFailure = true;
                missionDomainState.domainVerdict = 'failed';
              }
            }
          } catch (_) {}
        }
        if (['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(eventType)) {
          missionDomainState.hasDomainFailure = true;
          missionDomainState.domainVerdict = 'failed';
        }
        const observation = await hallucinationMonitor.recordObservation(db, currentEvent);
        if (eventType === 'EVIDENCE_REPORT' && dispatchedAgent.execution_mode === 'orchestrator' && autonomyPlan?.synthesisOnly) {
          try {
            const report = extractEvidenceReport(currentEvent.payload);
            validateDossierInfluence(report, autonomyPlan.completedWorkerIds || []);
          } catch (error) {
            emit(agentId, 'DOSSIER_INFLUENCE_INVALID', 'EVIDENCE_GATE', error.message, { error: error.code }, 'critical', 'error');
            haltRuntime('evidence_gate', error.message, 'Runtime halted because the final synthesis did not account for every worker dossier.', { error: error.code });
            continue;
          }
        }
        if (observation.monitored && observation.detected) {
          emit(agentId, 'HALLUCINATION_DETECTED', 'EVIDENCE_GATE', observation.reasons.join('; '), {
            sourceEventId: currentEvent.id, sourceEventType: eventType, total: observation.total, reasons: observation.reasons
          }, 'warning');
          const autopsy = await resilienceService.evaluateApoptosis(agentId, { hallucinations: observation.total }, db);
          if (autopsy.apoptosisExecuted && !termination) {
            emit(agentId, 'APOPTOSIS_TRIGGERED', 'HALLUCINATION_LIMIT', autopsy.triggerReason, { autopsy }, 'critical', 'apoptosis');
            haltRuntime('apoptosis', autopsy.triggerReason, 'Runtime halted after the hallucination limit was reached.', { autopsy });
            continue;
          }
        }
        if (decision?.halt && !termination && !finalEvent) {
          emit(agentId, 'STRATEGY_GUARDRAIL_BLOCKED', 'HALT', decision.reason, { runId: executionRun.id }, 'critical', 'error');
          haltRuntime('guardrail', decision.reason, 'Runtime halted by the strategy execution guardrail.', { runId: executionRun.id });
        }

        // Swarm Sentinel: Surveillance active de l'entropie de Shannon & effondrement de boucle
        const sentinelResult = swarmSentinel.inspectEvent(agentId, currentEvent);
        if (sentinelResult.intervention && !termination && !finalEvent) {
          emit(agentId, 'SWARM_ENTROPY_COLLAPSE', 'SENTINEL_HALT', sentinelResult.reason, {
            state: sentinelResult.state, normalizedEntropy: sentinelResult.normalizedEntropy
          }, 'critical', 'deadlock_collapse');
          haltRuntime('deadlock_collapse', sentinelResult.reason, 'Runtime halted: Swarm Sentinel detected infinite cognitive repetition / deadlock.', { sentinelResult });
          continue;
        } else if (sentinelResult.action === 'WARN_SPIKE') {
          emit(agentId, 'SWARM_ENTROPY_SPIKE', 'ENTROPY_WARNING', sentinelResult.reason, {
            state: sentinelResult.state, normalizedEntropy: sentinelResult.normalizedEntropy
          }, 'warning');
        }

        const msgRecipient = currentEvent.payload?.recipient || currentEvent.payload?.targetAgentId || currentEvent.recipient;
        const msgSender = currentEvent.payload?.sender || currentEvent.sender || (msgRecipient ? agentId : null);
        if (msgSender && msgRecipient && msgSender !== msgRecipient) {
          const deadlockStatus = swarmSentinel.recordInteraction(
            msgSender,
            msgRecipient,
            Boolean(currentEvent.payload?.hasDiff || currentEvent.payload?.diff || currentEvent.hasDiff)
          );
          if (deadlockStatus?.deadlockDetected && !termination && !finalEvent) {
            emit(agentId, 'SWARM_INTERACTION_DEADLOCK', 'SENTINEL_HALT', deadlockStatus.recommendation, {
              circularDeadlocks: deadlockStatus.circularDeadlocks,
              chattyLoops: deadlockStatus.chattyLoops
            }, 'critical', 'deadlock_collapse');
            haltRuntime('deadlock_collapse', deadlockStatus.recommendation, 'Runtime halted: Swarm Sentinel detected circular inter-agent deadlock or chatty loop.', { deadlockStatus });
            continue;
          }
        }

        // Évaluation de la Conscience Cognitive
        const isHallucinationEvent = Boolean(observation?.monitored && observation?.detected);
        const isErrorEvent = ['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(eventType)
          || (currentEvent.severity === 'error' && !['EVIDENCE_REPORT', 'DOSSIER_INFLUENCE_VERIFIED'].includes(eventType));
        const isSuccessEvent = ['EVIDENCE_REPORT', 'DOSSIER_INFLUENCE_VERIFIED'].includes(eventType)
          && currentEvent.severity !== 'error'
          && !isHallucinationEvent;

        if (isErrorEvent || isHallucinationEvent) {
          const detailText = String(currentEvent.detail || '') + ' ' + (typeof currentEvent.payload === 'string' ? currentEvent.payload : JSON.stringify(currentEvent.payload || {}));
          const cognitiveHealth = cognitiveMonitor.evaluateCognitiveHealth(detailText);
          if (isHallucinationEvent) {
            cognitiveHealth.semantic_drift = Math.max(cognitiveHealth.semantic_drift || 0, 1.0);
            cognitiveHealth.health_score = Math.min(cognitiveHealth.health_score ?? 1.0, 0.2);
          }
          const evalResult = agentConscience.evaluateBranch(conscienceState, {
            errorsInLoop: isErrorEvent ? 1 : 0,
            cognitiveHealth
          });
          emit(agentId, 'CONSCIENCE_STATE_UPDATED', 'CONSCIENCE', `Dissonance cognitive augmentée à ${conscienceState.dissonanceLevel.toFixed(1)}.`, { conscienceState }, 'warning');
          if (evalResult.apoptoticTriggered && !termination) {
            emit(agentId, 'COGNITIVE_APOPTOSIS', 'CONSCIENCE_LIMIT', `Dissonance cognitive critique (${conscienceState.dissonanceLevel.toFixed(1)} >= ${conscienceState.maxDissonanceThreshold}). Apoptose déclenchée.`, { conscienceState }, 'critical', 'apoptosis');
            await agentConscience.persistConscienceState(db, agentId, conscienceState, { reason: 'cognitive_apoptosis' });
            haltRuntime('cognitive_apoptosis', 'Dissonance cognitive critique.', 'Runtime halted by Cognitive Conscience Apoptosis.', { conscienceState });
            continue;
          }
          await agentConscience.persistConscienceState(db, agentId, conscienceState, { reason: isHallucinationEvent ? 'supervisor_hallucination' : 'supervisor_error' });
        } else if (isSuccessEvent) {
          agentConscience.triggerEureka(conscienceState);
          emit(agentId, 'COGNITIVE_EUREKA', 'EUREKA', `Événement Eurêka enregistré ! Dissonance réduite à ${conscienceState.dissonanceLevel.toFixed(1)}.`, { conscienceState }, 'info');
          await agentConscience.persistConscienceState(db, agentId, conscienceState, { reason: 'supervisor_eureka' });
        }

        await advanceAutonomousRound(normalizedMission, currentEvent);
      } catch (err) {
        console.error('Error processing event', err);
      }
    }
    isProcessingEvents = false;
  };

  let stdoutBuffer = Buffer.alloc(0);
  let stderrBuffer = '';
  let terminalEventSeen = false;
  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    if (stdoutBuffer.length > MAX_FRAME_BYTES + 4) {
      haltRuntime('protocol', `Runtime event buffer exceeds ${MAX_FRAME_BYTES} bytes.`, 'Runtime halted after an oversized or incomplete event frame.');
      stdoutBuffer = Buffer.alloc(0);
      return;
    }
    try { stdoutBuffer = decodeEvents(stdoutBuffer, (event) => {
      let payload = {};
      try { payload = event.payloadJson ? JSON.parse(event.payloadJson) : {}; } catch { payload = { raw: event.payloadJson }; }
      const nextStatus = event.status || (event.eventType === 'AGENT_COMPLETED' ? 'completed' : undefined);
      if (['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'AGENT_HALTED', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN', 'MISSION_NO_ANSWER_PROVEN'].includes(event.eventType)) terminalEventSeen = true;
      if (nextStatus || event.currentTask) {
        executionQueue = executionQueue.then(() => updateAgent(agentId, nextStatus, event.currentTask));
      }
      emitTracked(event.eventType || 'AGENT_STEP', event.action || 'EXECUTE', event.detail || '', payload, event.severity || 'info', nextStatus);
    }); } catch (error) {
      haltRuntime('protocol', error.message, 'Runtime halted after an invalid event frame.');
      stdoutBuffer = Buffer.alloc(0);
    }
  });
  child.stderr.on('data', (chunk) => {
    const detail = chunk.toString();
    stderrBuffer = `${stderrBuffer}${detail}`.slice(-4000);
    if (detail.trim()) emitTracked('AGENT_RUNTIME_LOG', 'STDERR', detail.trim(), {}, 'warning');
  });
  child.stdin.on('error', (error) => {
    emitTracked('AGENT_RUNTIME_ERROR', 'STDIN', error.message, {}, 'error', 'error');
  });
  child.on('error', async (error) => {
    try {
      if (termination) return;
      terminalEventSeen = true;
      await updateAgent(agentId, 'error', error.message);
      emitTracked('AGENT_RUNTIME_ERROR', 'ERROR', error.message, {}, 'error', 'error');
    } catch (err) {
      console.error(`[AgentSupervisor] Error handling child process error for ${agentId}:`, err);
    }
  });
  child.on('close', async (code, signal) => {
    try {
      clearTerminationTimer(child);
      await executionQueue;
      const drainDeadline = Date.now() + 30000;
      while ((isProcessingEvents || eventQueue.length > 0) && Date.now() < drainDeadline) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    } catch (err) {
      console.error(`[AgentSupervisor] Error draining event queue for ${agentId}:`, err);
    } finally {
      // Keep the process visible to the orchestration barrier until every final
      // event (including continuation selection) has been recorded.
      activeProcesses.delete(agentId);
      swarmSentinel.clearAgent(agentId);
    }

    try {
      await finalizeChildClose({
        db, agentId, dispatchedAgent, normalizedMission, child, code, signal, stderrBuffer,
        termination, missionDomainState, terminalEventSeen, emitTracked, executionQueue,
        workspaceLifecycle, workerGarage, emit, updateAgent
      });
    } catch (err) {
      console.error(`[AgentSupervisor] Error finalizing agent process close for ${agentId}:`, err);
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
  });
  await updateAgent(agentId, 'running', normalizedMission.prompt);
  emitTracked('WORKER_RUNTIME_CAPABILITIES', 'LEASE', 'Worker runtime capabilities activated.', {
    toolLease: normalizedMission.toolLease || [],
    runtimeMode: isLocalRuntime(resolvedExecutable) ? 'local' : 'supervised',
    capabilityCount: Array.isArray(normalizedMission.toolLease) ? normalizedMission.toolLease.length : 0
  }, 'info', 'running');
  emitTracked('AGENT_RUNTIME_STARTED', 'START', `Runtime started with ${resolvedExecutable}.`, {
    executable: resolvedExecutable,
    executionRunId: executionRun.id,
    autonomyPlan,
    replayManifest: buildReplayManifest({ agentId, normalizedMission, executionRun, contractRecord, autonomyPlan, runtimeBudget, runtimeEnvironment, workspaceRoot, resolvedExecutable })
  }, 'info', 'running');
  if (isLocalRuntime(resolvedExecutable) && !normalizedMission.localRoutingPolicy) {
    const workspace = normalizedMission.workspaceId
      ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
      : {};
    const discovered = await localModelDiscovery.discoverChatModelUris();
    normalizedMission.localRoutingPolicy = await modelRouter.localRoutingPolicy(db, { agentId, ...workspace }, discovered);
    normalizedMission.localModel = normalizedMission.localRoutingPolicy.primary;
  }
  child.stdin.end(encodeMission({
    agentId,
    name: normalizedMission.name || dispatchedAgent.name || '',
    nameMeaning: normalizedMission.nameMeaning || dispatchedAgent.name_meaning || '',
    role: normalizedMission.role || '',
    prompt: normalizedMission.prompt || normalizedMission.currentTask || '',
    modelTier: normalizedMission.modelTier || '',
    workspaceRoot,
    workspaceIsolation: normalizedMission.workspaceIsolation || '',
    agentType: normalizedMission.agentType || '',
    strategyContractJson: JSON.stringify(runtimeStrategyContract),
    executionMode: dispatchedAgent.execution_mode,
    orchestratorAgentId: normalizedMission.orchestratorAgentId || '',
    autonomyPlanJson: JSON.stringify(autonomyPlan || {})
    ,toolLeaseJson: JSON.stringify(normalizedMission.toolLease || []),
    genosCapsuleJson: JSON.stringify(genosCapsule),
    executionPolicyJson: JSON.stringify(normalizedMission.executionPolicy),
    executionBudgetJson: JSON.stringify(runtimeBudget || {}),
    localModel: normalizedMission.localModel || '',
    localRoutingPolicyJson: JSON.stringify(normalizedMission.localRoutingPolicy || {})
  }));
  return { started: true, executionRun };
}

module.exports = { superviseMission, runtimeExitOutcome, buildReplayManifest };
