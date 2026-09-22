'use strict';

const crypto = require('crypto');
const telemetry = require('./telemetryObserver');
const immuneMemory = require('./immuneMemoryService');

const MAX_HOMEOSTASIS_CONTINUATIONS = 3;

// Safety-first classification: an unsafe status must never be masked by a
// failed invariant (which an unsafe evaluation almost certainly also has).
function classifyDeviation(evaluation = {}) {
  if (evaluation.status === 'unsafe') return 'unsafe_action';
  const state = evaluation.state || {};
  if (state.failedInvariants && state.failedInvariants.length > 0) return 'failed_proof';
  if (state.evidence && !state.evidence.satisfied) return 'missing_work';
  if (evaluation.status === 'evidence_missing') return 'missing_work';
  return 'incomplete';
}

function getImmuneAdvice(organismState, deviation) {
  const response = immuneMemory.immuneResponse(organismState, {
    failureCategory: `homeostasis:${deviation}`,
    strategy: 'homeostasis_continuation'
  });
  return response && response.recognized ? response.response : null;
}

// Immune advice becomes a hard constraint: if the category itself is prohibited
// (not just the exact signature), reject the candidate continuation strategy.
function isImmuneBlocked(organismState, deviation, strategy) {
  const response = immuneMemory.immuneResponse(organismState, {
    failureCategory: `homeostasis:${deviation}`,
    strategy
  });
  if (!response || !response.recognized) return false;
  return response.response.prohibitExactRetry === true;
}

function findMissingEvidence(evaluation = {}) {
  const state = evaluation.state || {};
  return (state.evidence && state.evidence.missing) || [];
}

function findFailedLabels(evaluation = {}) {
  const state = evaluation.state || {};
  const failed = state.failedInvariants || [];
  return failed.map((f) => f.label || f.id).filter(Boolean);
}

function buildPrompt(mission, deviation, evaluation = {}) {
  const task = mission.task || mission.objective || 'Continue the mission';
  const missing = findMissingEvidence(evaluation);
  const failedLabels = findFailedLabels(evaluation);
  const lines = [
    'HOMEOSTASIS CONTINUATION — your previous pass did not satisfy the completion gate.',
    `Task: ${task}`,
    `Deviation: ${deviation}`
  ];
  if (missing.length) lines.push(`Missing evidence: ${missing.join(', ')}`);
  if (failedLabels.length) lines.push(`Failed invariants: ${failedLabels.join(', ')}`);
  lines.push('Produce the missing evidence only. Do not repeat work that already passed.');
  return lines.join('\n');
}

async function getOrchContext(db, orchestratorId) {
  return db.get(
    `SELECT a.workspace_id, a.fleet_id, a.model_tier, a.language, a.isolation_mode,
       w.organization_id, w.project_id
     FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = ?`,
    orchestratorId
  );
}

function resolveRole(advice) {
  if (advice && advice.preferredResponse === 'replace_worker') return 'recovery_specialist';
  return 'homeostasis_continuation';
}

function continuationDecisionId(missionId, deviation, stateVersion) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ missionId, deviation, stateVersion }))
    .digest('hex');
}

function countContinuationRounds(db, missionId, stateVersion) {
  // Count prior continuation attempts for this mission+state in the
  // continuation_queue. Synchronous read via the shared connection.
  return new Promise((resolve) => {
    db.get(
      `SELECT COUNT(*) AS n FROM continuation_queue
       WHERE json_extract(mission_json, '$.homeostasisMissionId') = ?
         AND json_extract(mission_json, '$.homeostasisStateVersion') = ?`,
      missionId, stateVersion
    ).then((row) => resolve(row ? row.n : 0)).catch(() => resolve(0));
  });
}

async function countHomeostasisContinuations(db, missionId, deviation) {
  try {
    const row = await db.get(
      `SELECT COUNT(*) AS n FROM continuation_queue
       WHERE json_extract(mission_json, '$.homeostasisMissionId') = ?
         AND json_extract(mission_json, '$.deviation') = ?
         AND status IN ('dispatched', 'completed', 'failed')`,
      missionId, deviation
    );
    return row ? row.n : 0;
  } catch {
    return 0;
  }
}

function buildAgentValues(deviation, advice, orchCtx) {
  return {
    id: `worker_homeostasis_${crypto.randomUUID()}`,
    name: `homeostasis_${deviation}`,
    role: resolveRole(advice),
    workspaceId: orchCtx?.workspace_id || null,
    fleetId: orchCtx?.fleet_id || null,
    modelTier: orchCtx?.model_tier || 'standard',
    language: orchCtx?.language || 'TypeScript',
    isolationMode: orchCtx?.isolation_mode || 'Branch'
  };
}

function persistHomeostasisAgent(db, agent, orchestratorId) {
  return db.run(
    `INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id,
      model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task)
     VALUES (?, ?, ?, ?, 'idle', 'GenOS', 'worker', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    agent.id, agent.name, `Homeostasis: ${agent.role}`, agent.role,
    agent.workspaceId, agent.fleetId, agent.modelTier, agent.language, agent.isolationMode,
    orchestratorId, 'homeostasis_continuation', `Continuing: ${agent.prompt.slice(0, 100)}`, agent.prompt
  );
}

function buildRecoveryMission(agent, mission, orchestratorId) {
  // Permissions inheritance: continuation worker MUST NOT have broader access
  // than its parent. Default to restricted unless parent explicitly allowed edits.
  const parentPolicy = mission.executionPolicy || {};
  const inheritedFileEdits = parentPolicy.allowFileEdits === true;

  return {
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    prompt: agent.prompt,
    executionBudget: { tokens: 8000, events: 5, costUsd: 0.5 },
    executionPolicy: { allowFileEdits: inheritedFileEdits },
    workspaceRoot: mission.workspaceRoot,
    workspaceId: agent.workspaceId,
    fleetId: agent.fleetId,
    modelTier: agent.modelTier,
    language: agent.language,
    isolationMode: agent.isolationMode,
    orchestratorAgentId: orchestratorId,
    autonomousOrchestration: false,
    budgetRound: { stage: 'homeostasis_continuation', orchestratorId }
  };
}

function emitDispatchTelemetry(info) {
  telemetry.emitEvent({
    eventType: 'MISSION_HOMEOSTASIS_CONTINUATION_DISPATCHED',
    agentId: info.orchestratorId,
    action: 'HOMEOSTASIS_CONTINUATION',
    detail: `Deviation: ${info.deviation}, role: ${info.role}, round: ${info.continuationRound}/${MAX_HOMEOSTASIS_CONTINUATIONS}`,
    payload: { missionId: info.missionId, targetAgentId: info.targetAgentId, deviation: info.deviation, decisionId: info.decisionId },
    severity: 'info'
  });
}

async function dispatchHomeostasisContinuation(input = {}) {
  const { db, orchestratorId, mission, organismState, evaluation } = input;
  const deviation = classifyDeviation(evaluation);
  const advice = getImmuneAdvice(organismState, deviation);
  const prompt = buildPrompt(mission, deviation, evaluation);
  const orchCtx = await getOrchContext(db, orchestratorId);
  const agent = buildAgentValues(deviation, advice, orchCtx);
  agent.prompt = prompt;

  // Budget guard: count prior continuations for this (mission, deviation) pair.
  // Refuse to dispatch beyond MAX_HOMEOSTASIS_CONTINUATIONS.
  const stateVersion = evaluation.state?.stateVersion || evaluation.evaluatedAt || Date.now();
  const decisionId = continuationDecisionId(mission.id, deviation, String(stateVersion));
  const priorRounds = await countHomeostasisContinuations(db, mission.id, deviation);

  if (priorRounds >= MAX_HOMEOSTASIS_CONTINUATIONS) {
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_CONTINUATION_BUDGET_EXHAUSTED',
      agentId: orchestratorId,
      action: 'BUDGET_EXHAUSTED',
      detail: `Homeostasis continuation budget (${MAX_HOMEOSTASIS_CONTINUATIONS}) exhausted for deviation=${deviation}`,
      payload: { missionId: mission.id, deviation, decisionId, priorRounds },
      severity: 'warning'
    });
    return { targetAgentId: null, deviation, exhausted: true, decisionId, continuationRound: priorRounds };
  }

  // Immune hard constraint: refuse if category prohibits this strategy
  if (isImmuneBlocked(organismState, deviation, 'homeostasis_continuation')) {
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_CONTINUATION_IMMUNE_BLOCKED',
      agentId: orchestratorId,
      action: 'IMMUNE_REFUSAL',
      detail: `Immune memory prohibits homeostasis_continuation for deviation=${deviation}`,
      payload: { missionId: mission.id, deviation, decisionId },
      severity: 'warning'
    });
    return { targetAgentId: null, deviation, immuneBlocked: true, decisionId, continuationRound: priorRounds };
  }

  await persistHomeostasisAgent(db, agent, orchestratorId);
  // Idempotency: if a continuation with this decision identity already exists
  // and is still active (pending/dispatched), return it without re-dispatching.
  const existingRecord = await db.get(
    `SELECT id, status FROM continuation_queue WHERE id = ?`,
    decisionId
  );
  if (existingRecord && (existingRecord.status === 'dispatched' || existingRecord.status === 'pending')) {
    return { targetAgentId: agent.id, deviation, preferredResponse: agent.role, decisionId, continuationRound: priorRounds, exhausted: false, idempotent: true };
  }
  await db.run(
    `INSERT INTO continuation_queue (id, agent_id, orchestrator_id, mission_json, status, attempts)
     VALUES (?, ?, ?, ?, 'dispatched', ?)`,
    decisionId, agent.id, orchestratorId,
    JSON.stringify({ homeostasisMissionId: mission.id, homeostasisStateVersion: String(stateVersion), deviation }),
    priorRounds + 1
  );
  const { startMission } = require('./agentRuntimeAdapter');
  await startMission(buildRecoveryMission(agent, mission, orchestratorId));
  emitDispatchTelemetry({ orchestratorId, missionId: mission.id, targetAgentId: agent.id, deviation, role: agent.role, decisionId, continuationRound: priorRounds + 1 });
  return { targetAgentId: agent.id, deviation, preferredResponse: agent.role, decisionId, continuationRound: priorRounds + 1, exhausted: false };
}

module.exports = {
  classifyDeviation,
  getImmuneAdvice,
  isImmuneBlocked,
  buildPrompt,
  dispatchHomeostasisContinuation,
  continuationDecisionId,
  countHomeostasisContinuations,
  MAX_HOMEOSTASIS_CONTINUATIONS
};
