/**
 * Process supervision for one agent runtime: spawns the framed-protobuf child,
 * decodes its event stream into telemetry, guardrails, and orchestration
 * decisions, and translates the exit into a terminal agent outcome.
 */
const path = require('path');
const { spawn } = require('child_process');
const { encodeMission, decodeEvents, MAX_FRAME_BYTES } = require('./runtimeProtocol');
const { resolveExecutable } = require('./agentRuntimeExecutable');
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
const { recordWorkerEvidence } = require('./agentEvidenceService');
const { advanceAutonomousRound, dispatchPendingContinuation } = require('./agentRoundService');
const { queueWorkerRecovery, dispatchWorkerRecovery, applyOrganizationDecision } = require('./agentRecoveryService');
const workspaceLifecycle = require('./agentWorkspaceLifecycleService');
const agentConscience = require('./agentConscienceService');
const swarmSentinel = require('./swarmSentinelService');
const { terminateChild, clearTerminationTimer } = require('./processTermination');

function runtimeExitOutcome(termination, code, options = {}) {
  const signal = typeof options === 'object' && options !== null ? options.signal : options;
  const stderr = typeof options === 'object' && options !== null ? (options.stderr || '') : (arguments[3] || '');
  if (termination) {
    return {
      status: 'blocked', eventType: 'AGENT_HALTED', action: 'GUARDRAIL', severity: 'warning',
      task: `Runtime halted: ${termination.reason}`,
      detail: `Runtime halted by ${termination.kind}: ${termination.reason}`,
      payload: { code, signal, terminationKind: termination.kind, terminationReason: termination.reason, stderr: String(stderr).trim() }
    };
  }
  if (code === 0) {
    return {
      status: 'completed', eventType: 'AGENT_COMPLETED', action: 'COMPLETE', severity: 'info', task: 'Execution completed',
      detail: 'Runtime completed successfully.', payload: { code }
    };
  }
  const lastError = String(stderr).trim().split(/\r?\n/).filter(Boolean).pop();
  return {
    status: 'error', eventType: 'AGENT_FAILED', action: 'ERROR', severity: 'error',
    task: `Runtime exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
    detail: `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`,
    payload: { code, signal, stderr: String(stderr).trim() }
  };
}

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
    env: { ...process.env, ...runtimeEnvironment, GENOS_WORKSPACE_ROOT: workspaceRoot, GENOS_SILENT_UPDATES: silentUpdates ? 'true' : 'false' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  activeProcesses.set(agentId, child);
  await db.run('UPDATE agents SET runtime_pid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', child.pid, agentId);
  // Disposable capsules (git worktrees or copies) are reclaimed after the
  // mission ends; a caller-provided workspace is never tracked.
  if (normalizedMission.workspaceProvisioned === true || dispatchedAgent.execution_mode === 'orchestrator') {
    workspaceLifecycle.trackWorkspace(agentId, workspaceRoot);
  }
  // This marker distinguishes a deliberate control-plane stop from a runtime
  // failure.  SIGTERM makes a child exit non-zero on many platforms, so the
  // close handler must not turn our own guardrail into AGENT_FAILED.
  let termination = null;
  let executionQueue = Promise.resolve();
  const haltRuntime = (kind, reason, detail, payload = {}) => {
    if (termination) return false;
    termination = { kind, reason };
    emit(agentId, 'AGENT_RUNTIME_HALT_REQUESTED', kind.toUpperCase(), detail, { reason, ...payload }, 'critical', 'blocked');
    terminateChild(child);
    return true;
  };
  const emitTracked = (eventType, action, detail, payload = {}, severity = 'info', status) => {
    const event = emit(agentId, eventType, action, detail, payload, severity, status);
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
    const decision = workerFailure ? null : decideFromEvent(event);
    if (decision) {
      db.get('SELECT parent_agent_id FROM agents WHERE id = ?', agentId).then((agent) => {
        const ownerId = agent?.parent_agent_id || agentId;
        emit(ownerId, 'ORCHESTRATION_DECISION', decision.action, decision.reason, { sourceAgentId: agentId, sourceEvent: eventType, ...decision }, 'info');
        if (decision.organization) applyOrganizationDecision(ownerId, decision.organization, decision.reason).catch(() => {});
        actionExecutor.execute({ orchestratorId: ownerId, sourceAgentId: agentId, decision, event, workspaceRoot }).catch(() => {});
      }).catch(() => {});
    }
    eventQueue.push(event);
    if (eventQueue.length > maxEventQueue) eventQueue.shift();
    processEventQueue();
    return event;
  };

  const eventQueue = [];
  const maxEventQueue = Math.max(1, Number(process.env.GENOS_RUNTIME_EVENT_QUEUE_CAPACITY) || 2048);
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
        const observation = await hallucinationMonitor.recordObservation(db, currentEvent);
        if (observation.monitored && observation.detected) {
          emit(agentId, 'HALLUCINATION_DETECTED', 'EVIDENCE_GATE', observation.reasons.join('; '), {
            sourceEventId: currentEvent.id, sourceEventType: eventType, total: observation.total, reasons: observation.reasons
          }, 'warning');
          const autopsy = await resilienceService.evaluateApoptosis(agentId, { hallucinations: observation.total }, db);
          if (autopsy.apoptosisExecuted && !termination && !finalEvent) {
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

        // Évaluation de la Conscience Cognitive
        const isErrorEvent = ['AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(eventType) || currentEvent.severity === 'error';
        const isSuccessEvent = ['EVIDENCE_REPORT', 'DOSSIER_INFLUENCE_VERIFIED'].includes(eventType) || (eventType === 'AGENT_STEP' && currentEvent.action === 'VERIFY');
        if (isErrorEvent) {
          const evalResult = agentConscience.evaluateBranch(conscienceState, { errorsInLoop: 1 });
          emit(agentId, 'CONSCIENCE_STATE_UPDATED', 'CONSCIENCE', `Dissonance cognitive augmentée à ${conscienceState.dissonanceLevel.toFixed(1)}.`, { conscienceState }, 'warning');
          if (evalResult.apoptoticTriggered && !termination && !finalEvent) {
            emit(agentId, 'COGNITIVE_APOPTOSIS', 'CONSCIENCE_LIMIT', `Dissonance cognitive critique (${conscienceState.dissonanceLevel.toFixed(1)} >= ${conscienceState.maxDissonanceThreshold}). Apoptose déclenchée.`, { conscienceState }, 'critical', 'apoptosis');
            haltRuntime('cognitive_apoptosis', 'Dissonance cognitive critique.', 'Runtime halted by Cognitive Conscience Apoptosis.', { conscienceState });
            continue;
          }
        } else if (isSuccessEvent) {
          agentConscience.triggerEureka(conscienceState);
          emit(agentId, 'COGNITIVE_EUREKA', 'EUREKA', `Événement Eurêka enregistré ! Dissonance réduite à ${conscienceState.dissonanceLevel.toFixed(1)}.`, { conscienceState }, 'info');
        }
        await agentConscience.persistConscienceState(db, agentId, conscienceState);

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
      if (['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR', 'AGENT_HALTED', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN'].includes(event.eventType)) terminalEventSeen = true;
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
    if (termination) return;
    terminalEventSeen = true;
    await updateAgent(agentId, 'error', error.message);
    emitTracked('AGENT_RUNTIME_ERROR', 'ERROR', error.message, {}, 'error', 'error');
  });
  child.on('close', async (code, signal) => {
    clearTerminationTimer(child);
    await executionQueue;
    // Keep the process visible to the orchestration barrier until every final
    // event (including continuation selection) has been recorded.
    activeProcesses.delete(agentId);
    await db.run('UPDATE agents SET runtime_pid = NULL WHERE id = ?', agentId);
    swarmSentinel.clearAgent(agentId);
    // The capsule outlives the process only by the GC grace delay, so
    // evidence-aware merging can finish reading it before reclamation.
    workspaceLifecycle.scheduleWorkspaceCleanup(agentId);
    const operatorStop = child.genosStopRequested ? { kind: 'operator', reason: 'Stopped from Studio' } : null;
    const outcome = runtimeExitOutcome(termination || operatorStop, code, signal, stderrBuffer);
    if (!terminalEventSeen || termination || operatorStop) {
      await updateAgent(agentId, outcome.status, outcome.task);
      emitTracked(outcome.eventType, outcome.action, outcome.detail, outcome.payload, outcome.severity, outcome.status);
      await executionQueue;
    }
    if (dispatchedAgent.execution_mode === 'worker') {
      const garage = await workerGarage.state(db, dispatchedAgent.parent_agent_id).catch(() => null);
      emit(dispatchedAgent.parent_agent_id, 'WORKER_SLOT_RELEASED', 'GARAGE', `Worker '${normalizedMission.name || dispatchedAgent.name}' released its active slot.`, {
        workerId: agentId,
        capacity: garage?.capacity || workerGarage.MAX_ACTIVE_WORKERS,
        occupied: garage?.occupied,
        available: garage?.available
      }, 'info');
    }
    await dispatchWorkerRecovery(agentId);
    dispatchPendingContinuation(agentId);
  });
  await updateAgent(agentId, 'running', normalizedMission.prompt);
  emitTracked('AGENT_RUNTIME_STARTED', 'START', `Runtime started with ${resolvedExecutable}.`, { executable: resolvedExecutable, executionRunId: executionRun.id, autonomyPlan }, 'info', 'running');
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
    executionBudgetJson: JSON.stringify(runtimeBudget || {})
  }));
  return { started: true, executionRun };
}

module.exports = { superviseMission, runtimeExitOutcome };
