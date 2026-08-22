/**
 * Provider-neutral bridge between Studio deployments and a real GenOS agent runtime.
 * The configured executable receives one framed protobuf mission on stdin and emits framed
 * protobuf events on stdout. Each event is forwarded to the Studio telemetry bus and agent state.
 */
const { spawn } = require('child_process');
const path = require('path');
const { getDatabase } = require('../db');
const telemetry = require('./telemetryObserver');
const strategyExecution = require('./strategyExecutionService');
const { encodeMission, decodeEvents } = require('./runtimeProtocol');

const activeProcesses = new Map();

function configuredExecutable() {
  const configured = String(process.env.GENOS_AGENT_EXECUTOR || '').trim();
  if (configured) return configured;

  // The bundled bridge is the supported local default. Keeping this fallback
  // here makes every launch path (npm, Studio, or an API test) behave the same
  // without requiring a separately managed environment file.
  return path.resolve(__dirname, '../../bin/genos-agent-runtime.cjs');
}

function resolveExecutable(executable, workspaceRoot) {
  // Keep PATH commands (for example, `node`) intact, but make local scripts
  // independent of whether the backend was launched from backend/ or the repo root.
  if (!path.isAbsolute(executable) && executable.includes(path.sep)) return path.resolve(workspaceRoot, executable);
  return executable;
}

function emit(agentId, eventType, action, detail, payload = {}, severity = 'info', status) {
  return telemetry.emitEvent({ eventType, agentId, action, detail, payload, severity, status });
}

async function updateAgent(agentId, status, currentTask) {
  const db = await getDatabase();
  await db.run(
    'UPDATE agents SET status = COALESCE(?, status), current_task = COALESCE(?, current_task), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    status || null, currentTask || null, agentId
  );
}

async function startMission(mission) {
  const agentId = mission.agentId || mission.id;
  const normalizedMission = { ...mission, agentId };
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const executable = configuredExecutable();
  if (activeProcesses.has(agentId)) return { started: true, duplicate: true };

  const db = await getDatabase();
  const executionRun = await strategyExecution.createExecutionRun(db, {
    agentId,
    budget: normalizedMission.executionBudget
  });

  // Keep the default stable regardless of whether `npm start` was launched from
  // the repository root or from backend/.
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const resolvedExecutable = resolveExecutable(executable, workspaceRoot);
  const child = spawn(resolvedExecutable, [], { cwd: workspaceRoot, env: { ...process.env, GENOS_WORKSPACE_ROOT: workspaceRoot }, stdio: ['pipe', 'pipe', 'pipe'] });
  activeProcesses.set(agentId, child);
  let guardrailHalted = false;
  let executionQueue = Promise.resolve();
  const emitTracked = (eventType, action, detail, payload = {}, severity = 'info', status) => {
    const event = emit(agentId, eventType, action, detail, payload, severity, status);
    executionQueue = executionQueue.then(() => strategyExecution.recordExecutionEvent(db, agentId, event)).then((decision) => {
      // A final runtime event may report that the mission exceeded its budget
      // only after the child has already completed. Record the guardrail on
      // the execution run, but never turn that completed child into a SIGTERM
      // failure and overwrite the agent's terminal state.
      const finalEvent = ['AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR'].includes(eventType);
      if (decision?.halt && !guardrailHalted && !finalEvent) {
        guardrailHalted = true;
        emit(agentId, 'STRATEGY_GUARDRAIL_BLOCKED', 'HALT', decision.reason, { runId: executionRun.id }, 'critical', 'error');
        child.kill('SIGTERM');
      }
    }).catch(() => {});
    return event;
  };

  let stdoutBuffer = Buffer.alloc(0);
  let stderrBuffer = '';
  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    stdoutBuffer = decodeEvents(stdoutBuffer, (event) => {
      let payload = {};
      try { payload = event.payloadJson ? JSON.parse(event.payloadJson) : {}; } catch { payload = { raw: event.payloadJson }; }
      const nextStatus = event.status || (event.eventType === 'AGENT_COMPLETED' ? 'idle' : undefined);
      if (nextStatus || event.currentTask) updateAgent(agentId, nextStatus, event.currentTask).catch(() => {});
      emitTracked(event.eventType || 'AGENT_STEP', event.action || 'EXECUTE', event.detail || '', payload, event.severity || 'info', nextStatus);
    });
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
    activeProcesses.delete(agentId);
    await updateAgent(agentId, 'error', error.message);
    emitTracked('AGENT_RUNTIME_ERROR', 'ERROR', error.message, {}, 'error', 'error');
  });
  child.on('close', async (code, signal) => {
    activeProcesses.delete(agentId);
    if (code === 0) {
      await updateAgent(agentId, 'idle', 'Execution completed');
      emitTracked('AGENT_COMPLETED', 'COMPLETE', 'Runtime completed successfully.', { code }, 'info', 'idle');
    } else {
      await updateAgent(agentId, 'error', `Runtime exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`);
      const lastError = stderrBuffer.trim().split(/\r?\n/).filter(Boolean).pop();
      emitTracked('AGENT_FAILED', 'ERROR', `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`, { code, signal, stderr: stderrBuffer.trim() }, 'error', 'error');
    }
  });
  await updateAgent(agentId, 'running', mission.prompt);
  emitTracked('AGENT_RUNTIME_STARTED', 'START', `Runtime started with ${resolvedExecutable}.`, { executable: resolvedExecutable, executionRunId: executionRun.id }, 'info', 'running');
  child.stdin.end(encodeMission({
    agentId,
    name: normalizedMission.name || '',
    role: normalizedMission.role || '',
    prompt: normalizedMission.prompt || normalizedMission.currentTask || '',
    modelTier: normalizedMission.modelTier || '',
    workspaceRoot,
    workspaceIsolation: normalizedMission.workspaceIsolation || '',
    agentType: normalizedMission.agentType || '',
    strategyContractJson: JSON.stringify(runtimeStrategyContract)
  }));
  return { started: true, executionRun };
}

function stopMission(agentId) {
  const child = activeProcesses.get(agentId);
  if (!child) return false;
  child.kill('SIGTERM');
  return true;
}

module.exports = { startMission, stopMission, configuredExecutable };
