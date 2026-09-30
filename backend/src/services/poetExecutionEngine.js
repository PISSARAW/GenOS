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
    return Number.isSafeInteger(row?.cursor) ? row.cursor : null;
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
    executionBudget: { latencyMs: opts.timeoutMs },
    executionPolicy: environment.executionPolicy || {},
    workspaceRoot: environment.workspacePath,
    workspaceId: environment.workspaceId,
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
    await runAgentToTermination({ agent, environment, opts, results });
  } catch (err) {
    results.error = err.message;
    results.success = false;
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
  const afterEventId = await readTelemetryCursor(agent.id);
  const missionPromise = launchAgentMission(agent, environment, opts);
  const terminationPromise = waitForMissionTermination(agent.id, opts.timeoutMs, afterEventId);
  const outcome = await Promise.race([
    terminationPromise.then((termination) => ({ termination })),
    missionPromise.then(() => new Promise(() => {}), (error) => ({ error }))
  ]);
  if (outcome.error) {
    terminationPromise.cancel();
    throw outcome.error;
  }
  const termination = outcome.termination;
  if (!termination.terminated) {
    results.error = timeoutMessage(opts.timeoutMs, termination.eventType);
    return;
  }
  attachOutcome(results, await missionPromise.catch(toErrorObject));
  await verifyAndScore(results, environment);
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
  return `${agent.role || 'Agent'}: ${goal}\n\nConstraints: ${JSON.stringify(constraints)}\n\nProvide a solution as structured output.`;
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
  const result = await runInSnapshot({
    snapshot: { id: snapshot?.id, snapshot_hash: snapshot?.snapshotHash, metadata: snapshot?.metadata },
    command: 'npm test',
    timeoutMs: 30000,
    workspacePath: environment.workspacePath,
  });

  return {
    valid: result.exitCode === 0,
    score: result.exitCode === 0 ? 1 : 0,
    output: result.stdout,
  };
}

module.exports = {
  executeAgentOnEnvironment,
  buildAgentPrompt,
  readTelemetryCursor,
  verifySolutionInSnapshot,
};
