'use strict';

/**
 * @file poetExecutionEngine.js
 * @description Exécution réelle des environnements POET.
 *
 * Corrigé : utilise le runtime agent pour l'exécution,
 * puis le sandbox uniquement pour vérification.
 *
 * Boucle :
 *   Agent runtime
 *       ↓
 *   solution/artifact
 *       ↓
 *   snapshot
 *       ↓
 *   allowed verifier command
 *       ↓
 *   score
 */

const runtime = require('./agentRuntimeAdapter');
const telemetry = require('./telemetryObserver');
const { withDeadline, abortable } = require('./operationDeadline');
const evidence = require('./poetExecutionEvidence');
const fs = require('node:fs/promises');

const TERMINAL_EVENTS = new Set([
  'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR',
  'AGENT_HALTED', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN',
  'MISSION_NO_ANSWER_PROVEN',
]);

const TERMINAL_EVENT_TYPES = [...TERMINAL_EVENTS];
const TERMINATION_POLL_INTERVAL_MS = 1000;

/**
 * Interroge la table partagée telemetry_events (visible inter-processus).
 * Retourne l'événement terminal le plus récent pour l'agent, ou null.
 */
async function readTelemetryCursor(agentId) {
  try {
    const { getDatabase } = require('../db');
    const db = await getDatabase();
    const row = await db.get('SELECT MAX(id) AS cursor FROM telemetry_events WHERE agent_id = ?', agentId);
    return Number.isSafeInteger(row?.cursor) ? row.cursor : 0;
  } catch (_) {
    return null;
  }
}

async function pollTerminalEvent(agentId, afterEventId) {
  if (!Number.isSafeInteger(afterEventId)) return null;
  try {
    const { getDatabase } = require('../db');
    const db = await getDatabase();
    const placeholders = TERMINAL_EVENT_TYPES.map(() => '?').join(',');
    const row = await db.get(
      `SELECT id, event_type, payload_json FROM telemetry_events WHERE agent_id = ? AND id > ? AND event_type IN (${placeholders}) ORDER BY id DESC LIMIT 1`,
      agentId, afterEventId, ...TERMINAL_EVENT_TYPES
    );
    if (!row || Number(row.id) <= afterEventId) return null;
    let event = null;
    try { event = JSON.parse(row.payload_json || '{}'); } catch (_) { event = {}; }
    return { eventType: row.event_type, event };
  } catch (_) {
    return null;
  }
}

function newTerminationState(deadline) {
  return { settled: false, timer: null, poller: null, deadline };
}

function newTerminationTrack(agentId, deadline, resolve) {
  return { agentId, state: newTerminationState(deadline), handler: null, resolve, afterEventId: null };
}

function finishTermination(track, result) {
  const state = track.state;
  if (state.settled) return;
  state.settled = true;
  if (state.timer) clearTimeout(state.timer);
  if (state.poller) clearInterval(state.poller);
  telemetry.removeListener('telemetry', track.handler);
  track.resolve(result);
}

function isTerminalFor(event, agentId) {
  if (!event) return false;
  if (event.agentId !== agentId) return false;
  return TERMINAL_EVENTS.has(event.eventType);
}

function timeoutResult() {
  return { terminated: false, eventType: 'TIMEOUT' };
}

async function checkTerminationDatabase(track) {
  if (track.state.settled) return;
  const found = await pollTerminalEvent(track.agentId, track.afterEventId);
  if (found) {
    finishTermination(track, { terminated: true, eventType: found.eventType, event: found.event, source: 'database' });
    return;
  }
  if (Date.now() >= track.state.deadline) {
    finishTermination(track, timeoutResult());
  }
}

/**
 * Attend la fin réelle de la mission de l'agent.
 * Robuste multi-processus: écoute locale EventEmitter (rapide) + sondage DB
 * (termine même si l'événement a été émis par un autre processus), avec timeout.
 */
function waitForMissionTermination(agentId, timeoutMs, afterEventId) {
  const deadline = Date.now() + Math.max(1, Number(timeoutMs) || 60000);
  let activeTrack = null;
  const promise = new Promise((resolve) => {
    const track = newTerminationTrack(agentId, deadline, resolve);
    activeTrack = track;
    track.afterEventId = afterEventId;
    track.handler = (event) => {
      if (!isTerminalFor(event, agentId)) return;
      finishTermination(track, { terminated: true, eventType: event.eventType, event, source: 'telemetry' });
    };
    telemetry.on('telemetry', track.handler);
    track.state.poller = setInterval(() => checkTerminationDatabase(track), TERMINATION_POLL_INTERVAL_MS);
    track.state.timer = setTimeout(() => finishTermination(track, timeoutResult()), Math.max(1, deadline - Date.now()));
    checkTerminationDatabase(track);
  });
  promise.cancel = () => {
    if (activeTrack) finishTermination(activeTrack, { terminated: false, eventType: 'RUNTIME_FAILED' });
  };
  return promise;
}

function baseResults(agent, environment) {
  return {
    agentId: agent.id,
    environmentId: environment.id,
    steps: [],
    success: false,
    score: 0,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
}

function launchAgentMission(agent, environment, opts) {
  return runtime.startMission({
    agentId: agent.id,
    name: `POET Agent ${agent.id}`,
    role: agent.role || 'solver',
    prompt: buildAgentPrompt(agent, environment),
    modelTier: opts.modelTier || 'standard',
    executionPolicy: environment.executionPolicy || {},
    workspaceRoot: environment.workspacePath,
    workspaceId: environment.workspaceId,
    workspaceProvisioned: true,
    executor: agent.executor,
    autonomousOrchestration: agent.autonomousOrchestration,
    toolLease: agent.toolLease,
    executionBudget: { ...agent.executionBudget, latencyMs: opts.timeoutMs },
  });
}

function attachOutcome(results, missionOutcome) {
  if (!missionOutcome || typeof missionOutcome !== 'object') return;
  results.missionOutcome = missionOutcome;
  if (missionOutcome.artifact) results.artifact = missionOutcome.artifact;
  if (missionOutcome.solution) results.solution = missionOutcome.solution;
}

async function verifyAndScore(results, environment) {
  const verificationResult = await verifySolutionInSnapshot(results, environment);
  results.success = verificationResult.valid;
  results.score = verificationResult.score;
  results.verification = verificationResult;
}

/**
 * Exécute un agent sur un environnement via le runtime.
 * Attend réellement la fin de l'agent avant de vérifier.
 */
async function executeAgentOnEnvironment(agent, environment, options) {
  const opts = normalizePoetOptions(options);
  const results = baseResults(agent, environment);
  try {
    const executionAgent = { ...agent, id: agent.executionAgentIds?.[environment.id] || agent.id };
    results.runtimeAgentId = executionAgent.id;
    const isolated = await evidence.isolateEnvironment(environment);
    results.baselineSnapshotHash = isolated.baselineSnapshotHash;
    results.executionWorkspace = isolated.workspacePath;
    await withDeadline({ timeoutMs: opts.timeoutMs },
      (signal) => runAgentToTermination({ agent: executionAgent, environment: isolated, opts, results, signal }));
  } catch (err) {
    results.error = err.message;
    if (process.env.GENOS_POET_DEBUG === '1') console.error(err.stack);
    results.success = false;
  } finally {
    if (results.executionWorkspace && options?.retainWorkspace !== true) {
      try { await fs.rm(results.executionWorkspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
      catch (error) { results.cleanupError = error.message; results.success = false; results.score = 0; }
    }
  }
  results.endedAt = new Date().toISOString();
  return results;
}

function normalizePoetOptions(options) {
  const opts = options || {};
  return { timeoutMs: opts.timeoutMs || 60000, modelTier: opts.modelTier || 'standard' };
}

async function runAgentToTermination(ctx) {
  const { agent, environment, opts, results } = ctx;
  const before = await evidence.artifactEvidence(environment);
  const afterEventId = await readTelemetryCursor(agent.id);
  const terminationPromise = waitForMissionTermination(agent.id, opts.timeoutMs, afterEventId);
  const cancel = () => {
    terminationPromise.cancel();
    Promise.resolve(runtime.stopMission?.(agent.id)).catch(() => {});
  };
  ctx.signal.addEventListener('abort', cancel, { once: true });
  try {
    const missionPromise = Promise.resolve().then(() => launchAgentMission(agent, environment, opts));
    const outcome = await Promise.race([
      terminationPromise.then((termination) => ({ termination })),
      missionPromise.then(() => new Promise(() => {}), (error) => ({ error }))
    ]);
    if (outcome.error) throw outcome.error;
    results.termination = outcome.termination;
    if (outcome.termination.eventType !== 'AGENT_COMPLETED') {
      if (!outcome.termination.terminated) cancel();
      throw new Error(terminationFailure(outcome.termination, opts.timeoutMs));
    }
    const missionOutcome = await abortable(missionPromise, ctx.signal);
    if (missionOutcome?.duplicate) throw new Error('POET cannot measure an already running mission');
    attachOutcome(results, missionOutcome);
    const artifact = await evidence.artifactEvidence(environment);
    if (!artifact || artifact.sha256 === before?.sha256) throw new Error('POET requires a new or changed file artifact');
    results.artifact = artifact;
    if (ctx.signal.aborted) return;
    await verifyAndScore(results, environment);
  } finally {
    ctx.signal.removeEventListener('abort', cancel);
    terminationPromise.cancel();
  }
}

function terminationFailure(termination, timeoutMs) {
  if (termination.terminated) return `POET runtime terminated with ${termination.eventType}`;
  return timeoutMessage(timeoutMs, termination.eventType);
}

function timeoutMessage(timeoutMs, eventType) {
  return `Mission did not terminate within ${timeoutMs}ms (last event: ${eventType})`;
}

function toErrorObject(err) {
  return { error: err.message };
}

function buildAgentPrompt(agent, environment) {
  const goal = environment.goals?.[0] || 'Solve the problem';
  const constraints = environment.constraints || {};
  return `${agent.role || 'Agent'}: ${goal}\n\nConstraints: ${JSON.stringify(constraints)}\n\nWrite the solution file ${environment.artifactPath || 'solution.json'} in the workspace. Provide a solution as structured output.`;
}

async function verifySolutionInSnapshot(missionResult, environment) {
  const { runInSnapshot } = require('./workspaceSnapshotRun');
  const { capture } = require('./workspaceSnapshotStore');

  // Vérification causale : l'agent doit avoir produit un artifact/solution
  const artifact = missionResult?.artifact || missionResult?.solution;
  if (!artifact) {
    return {
      valid: false,
      score: 0,
      output: 'POET verification: no artifact or solution produced by agent run',
    };
  }

  // Prépare le snapshot
  const db = environment.db || await require('../db').getDatabase();
  const snapshot = await capture({
    db,
    workspace: { path: environment.workspacePath, id: environment.workspaceId },
    label: 'POET verification',
    reason: 'Verify solution',
    author: 'poet_engine',
    agentId: environment.id,
  });

  // Vérifie via commande autorisée
  const snapshotPath = snapshot?.metadata?.storagePath;
  if (!snapshotPath) {
    return {
      valid: false,
      score: 0,
      output: 'POET verification: capture returned no storagePath',
    };
  }
  const binding = await evidence.bindSnapshot(snapshot, artifact, environment);
  const result = await runInSnapshot({
    snapshot: { id: snapshot?.id, snapshot_hash: snapshot?.snapshotHash, metadata: snapshot?.metadata },
    command: environment.verifierCommand,
    timeoutMs: 30000,
    workspacePath: environment.workspacePath,
  });

  return {
    ...binding,
    valid: result.exitCode === 0,
    score: result.exitCode === 0 ? 1 : 0,
    output: result.stdout,
    stderr: result.stderr, exitCode: result.exitCode,
  };
}

module.exports = {
  executeAgentOnEnvironment,
  buildAgentPrompt,
  readTelemetryCursor,
  verifySolutionInSnapshot,
};
