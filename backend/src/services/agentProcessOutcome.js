/**
 * Runtime environment, manifest, and exit outcome utilities for AgentProcessSupervisor.
 */
const SAFE_RUNTIME_ENV = new Set([
  'PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'CODEX_EXECUTABLE',
  'LANG', 'LC_ALL', 'NODE_ENV'
]);

function isSensitiveEnvironmentName(name) {
  return /(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|API)/i.test(name);
}

function buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, silentUpdates) {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (SAFE_RUNTIME_ENV.has(name) || (name.startsWith('GENOS_') && !isSensitiveEnvironmentName(name))) {
      environment[name] = value;
    }
  }
  for (const [name, value] of Object.entries(runtimeEnvironment || {})) {
    if (!isSensitiveEnvironmentName(name)) environment[name] = value;
  }
  return {
    ...environment,
    GENOS_WORKSPACE_ROOT: workspaceRoot,
    GENOS_SILENT_UPDATES: silentUpdates ? 'true' : 'false'
  };
}

function buildReplayManifest({ agentId, normalizedMission, executionRun, contractRecord, autonomyPlan, runtimeBudget, runtimeEnvironment, workspaceRoot, resolvedExecutable }) {
  const safeEnvironment = buildRuntimeEnvironment(runtimeEnvironment, workspaceRoot, false);
  return {
    sessionId: executionRun.id,
    agentId,
    prompt: String(normalizedMission.prompt || normalizedMission.currentTask || ''),
    role: normalizedMission.role || null,
    model: normalizedMission.localModel || normalizedMission.model || null,
    executionRunId: executionRun.id,
    contractId: contractRecord.id,
    contractVersion: contractRecord.version,
    budget: runtimeBudget || null,
    executionPolicy: normalizedMission.executionPolicy || null,
    autonomyPlan: autonomyPlan || null,
    workspaceRoot,
    executable: resolvedExecutable,
    environmentKeys: Object.keys(safeEnvironment || {}).sort()
  };
}

function runtimeExitOutcome(termination, code, options = {}, domainState = {}) {
  const signal = typeof options === 'object' && options !== null ? options.signal : options;
  const stderr = typeof options === 'object' && options !== null ? (options.stderr || '') : (arguments[3] || '');
  const extra = (typeof options === 'object' && options !== null && options.domainVerdict)
    ? options
    : (arguments[4] || domainState || {});
  const hasDomainFailure = Boolean(extra.hasDomainFailure);
  const unverified = Boolean(extra.unverified);
  const explicitFailed = extra.domainVerdict === 'failed' || hasDomainFailure;
  if (termination) {
    return {
      status: 'blocked', eventType: 'AGENT_HALTED', action: 'GUARDRAIL', severity: 'warning',
      task: `Runtime halted: ${termination.reason}`,
      detail: `Runtime halted by ${termination.kind}: ${termination.reason}`,
      payload: { code, signal, terminationKind: termination.kind, terminationReason: termination.reason, stderr: String(stderr).trim() }
    };
  }
  const executionStatus = code === 0 ? 'exit_zero' : 'exit_nonzero';
  let domainVerdict = 'completed';
  if (explicitFailed) domainVerdict = 'failed';
  else if (unverified) domainVerdict = 'unverified';
  if (code === 0) {
    const finalStatus = explicitFailed ? 'failed' : (unverified ? 'unverified' : 'completed');
    const finalEventType = explicitFailed ? 'AGENT_FAILED' : 'AGENT_COMPLETED';
    const severity = explicitFailed ? 'error' : (unverified ? 'warning' : 'info');
    return {
      status: finalStatus, eventType: finalEventType, action: 'COMPLETE', severity, task: 'Execution completed',
      detail: `Runtime completed (process: success, domain: ${domainVerdict}).`,
      payload: { code, executionStatus, domainVerdict }
    };
  }
  const lastError = String(stderr).trim().split(/\r?\n/).filter(Boolean).pop();
  return {
    status: 'error', eventType: 'AGENT_FAILED', action: 'ERROR', severity: 'error',
    task: `Runtime exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
    detail: `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`,
    payload: { code, signal, stderr: String(stderr).trim(), executionStatus, domainVerdict: 'failed' }
  };
}

async function finalizeChildClose({
  db, agentId, dispatchedAgent, normalizedMission, child, code, signal, stderrBuffer,
  termination, missionDomainState, terminalEventSeen, emitTracked, executionQueue,
  workspaceLifecycle, workerGarage, emit, updateAgent
}) {
  await db.run('UPDATE agents SET runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL WHERE id = ?', agentId);
  await workspaceLifecycle.scheduleWorkspaceCleanup(agentId);
  const operatorStop = child.genosStopRequested ? { kind: 'operator', reason: 'Stopped from Studio' } : null;
  const outcome = runtimeExitOutcome(termination || operatorStop, code, signal, stderrBuffer, missionDomainState);
  const persistedAgent = await db.get('SELECT status, is_apoptotic FROM agents WHERE id = ?', agentId);
  const apoptosisTerminal = persistedAgent?.status === 'apoptosis' || Boolean(persistedAgent?.is_apoptotic);
  if ((!terminalEventSeen || termination || operatorStop) && !apoptosisTerminal) {
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
}

module.exports = {
  SAFE_RUNTIME_ENV,
  isSensitiveEnvironmentName,
  buildRuntimeEnvironment,
  buildReplayManifest,
  runtimeExitOutcome,
  finalizeChildClose
};
