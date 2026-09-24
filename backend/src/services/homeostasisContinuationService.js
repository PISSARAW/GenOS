'use strict';

const crypto = require('crypto');
const telemetry = require('./telemetryObserver');
const immuneMemory = require('./immuneMemoryService');

const MAX_HOMEOSTASIS_CONTINUATIONS = 3;

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

function isImmuneBlocked(organismState, deviation, strategy) {
  const response = immuneMemory.immuneResponse(organismState, {
    failureCategory: `homeostasis:${deviation}`,
    strategy
  });
  if (response && response.recognized && response.response.prohibitExactRetry === true) return true;
  const memories = immuneMemory.immuneMemoryFromOrganism(organismState);
  if (!Array.isArray(memories)) return false;
  return memories.some((entry) => entry.strategy === strategy && entry.prohibitedExactRetry !== false
    && immuneMemory.isExactRetryProhibited(memories, {
      failureCategory: entry.failureCategory,
      strategy
    }));
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

function continuationFingerprint(evaluation = {}) {
  const missing = findMissingEvidence(evaluation).slice().sort();
  const failed = findFailedLabels(evaluation).slice().sort();
  return crypto.createHash('sha256')
    .update(JSON.stringify({ missing, failed }))
    .digest('hex')
    .slice(0, 16);
}

function continuationDecisionId(input = {}) {
  const { missionId, deviation, fingerprint, round } = input;
  return crypto.createHash('sha256')
    .update(JSON.stringify({ missionId, deviation, fingerprint, round }))
    .digest('hex');
}

async function countHomeostasisContinuations(db, missionId, deviation) {
  try {
    const row = await db.get(
      `SELECT COUNT(*) AS n FROM continuation_queue
       WHERE json_extract(mission_json, '$.homeostasisMissionId') = ?
         AND json_extract(mission_json, '$.deviation') = ?
         AND status IN ('pending', 'dispatched', 'completed', 'failed')`,
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

function capBudgetValue(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(fallback, num);
}

function continuationBudget(parentBudget) {
  const base = { tokens: 8000, events: 5, costUsd: 0.5 };
  if (!parentBudget || typeof parentBudget !== 'object') return base;
  return {
    tokens: Math.floor(capBudgetValue(parentBudget.tokens, base.tokens)),
    events: Math.floor(capBudgetValue(parentBudget.events, base.events)),
    costUsd: capBudgetValue(parentBudget.costUsd, base.costUsd)
  };
}

function buildRecoveryMission({ agent, mission, orchestratorId, queueJson = {} }) {
  const inheritedPolicy = queueJson?.executionPolicy || mission.executionPolicy || {};
  return {
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    prompt: agent.prompt,
    executionBudget: continuationBudget(mission.executionBudget),
    executionPolicy: inheritedPolicy,
    workspaceRoot: queueJson?.workspaceRoot || mission.workspaceRoot,
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

async function findActiveContinuation({ db, missionId, deviation, fingerprint }) {
  try {
    return await db.get(
      `SELECT id, agent_id, status FROM continuation_queue
       WHERE json_extract(mission_json, '$.homeostasisMissionId') = ?
         AND json_extract(mission_json, '$.deviation') = ?
         AND json_extract(mission_json, '$.homeostasisFingerprint') = ?
         AND status IN ('pending', 'dispatched')
       ORDER BY created_at DESC LIMIT 1`,
      missionId, deviation, fingerprint
    );
  } catch {
    return null;
  }
}

async function findQueueRecordById(db, decisionId) {
  try {
    return await db.get('SELECT id, agent_id, status FROM continuation_queue WHERE id = ?', decisionId);
  } catch {
    return null;
  }
}

function isConstraintError(err) {
  if (!err) return false;
  if (err.code === 'SQLITE_CONSTRAINT') return true;
  return /constraint/i.test(String(err.message || ''));
}

async function persistQueueRecord({ db, decisionId, agent, orchestratorId, mission, fingerprint, deviation, priorRounds }) {
  const missionJson = JSON.stringify({
    homeostasisMissionId: mission.id,
    homeostasisFingerprint: fingerprint,
    deviation,
    executionPolicy: mission.executionPolicy || null,
    workspaceRoot: mission.workspaceRoot || null,
    allowedCommands: mission.allowedCommands || null,
    toolLease: mission.toolLease || null,
  });
  try {
    const res = await db.run(
      `INSERT INTO continuation_queue (id, agent_id, orchestrator_id, mission_json, status, attempts)
       VALUES (?, ?, ?, ?, 'pending', ?)
       ON CONFLICT DO NOTHING`,
      decisionId, agent.id, orchestratorId, missionJson, priorRounds + 1
    );
    return { inserted: (res?.changes ?? 1) > 0 };
  } catch (err) {
    if (isConstraintError(err)) {
      const existing = await findQueueRecordById(db, decisionId);
      if (existing) return { inserted: false };
    }
    throw err;
  }
}

async function startContinuationRuntime({ db, agent, mission, orchestratorId, decisionId }) {
  const { startMission } = require('./agentRuntimeAdapter');
  const queueJson = {
    executionPolicy: mission.executionPolicy || null,
    workspaceRoot: mission.workspaceRoot || null,
    allowedCommands: mission.allowedCommands || null,
    toolLease: mission.toolLease || null,
  };
  const recoveryMission = buildRecoveryMission({ agent, mission, orchestratorId, queueJson });
  try {
    await startMission(recoveryMission);
  } catch (startErr) {
    await db.run(
      `UPDATE continuation_queue SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [decisionId]
    );
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_CONTINUATION_START_FAILED',
      agentId: orchestratorId,
      action: 'START_FAILED',
      detail: `Continuation worker ${agent.id} failed to start: ${startErr.message}`,
      payload: { missionId: mission.id, deviation: classifyDeviation({}), targetAgentId: agent.id, decisionId },
      severity: 'error'
    });
    return false;
  }
  await db.run(
    `UPDATE continuation_queue SET status = 'dispatched', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [decisionId]
  );
  return true;
}

async function checkEarlyExit({ db, mission, organismState, evaluation, advice, fingerprint, priorRounds }) {
  const orchestratorId = mission.orchestratorId;
  const deviation = classifyDeviation(evaluation);
  const decisionId = continuationDecisionId({ missionId: mission.id, deviation, fingerprint, round: priorRounds });
  if (deviation === 'unsafe_action') {
    telemetry.emitEvent({
      eventType: 'HOMEOSTASIS_UNSAFE_QUARANTINED',
      agentId: orchestratorId,
      action: 'WAIT_HUMAN',
      detail: 'Unsafe homeostasis: continuation refused, quarantine / human gate required.',
      payload: { missionId: mission.id, deviation },
      severity: 'error'
    });
    return { targetAgentId: null, deviation, quarantined: true, exhausted: false };
  }
  const activeRecord = await findActiveContinuation({ db, missionId: mission.id, deviation, fingerprint });
  if (activeRecord) {
    return { targetAgentId: activeRecord.agent_id, deviation, preferredResponse: advice?.preferredResponse || null, decisionId: activeRecord.id, continuationRound: priorRounds, exhausted: false, idempotent: true };
  }
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
  return null;
}

function idempotentContinuation({ existing, deviation, decisionId, priorRounds }) {
  return { targetAgentId: existing?.agent_id || null, deviation, preferredResponse: null, decisionId: existing?.id || decisionId, continuationRound: priorRounds, exhausted: false, idempotent: true };
}

async function dispatchHomeostasisContinuation({ db, mission, organismState, evaluation }) {
  const orchestratorId = mission.orchestratorId;
  const deviation = classifyDeviation(evaluation);
  const advice = getImmuneAdvice(organismState, deviation);
  const fingerprint = continuationFingerprint(evaluation);
  const priorRounds = await countHomeostasisContinuations(db, mission.id, deviation);
  const earlyExit = await checkEarlyExit({ db, mission, organismState, evaluation, advice, fingerprint, priorRounds });
  if (earlyExit) return earlyExit;
  const decisionId = continuationDecisionId({ missionId: mission.id, deviation, fingerprint, round: priorRounds });
  const existingClaim = await findQueueRecordById(db, decisionId);
  if (existingClaim) return idempotentContinuation({ existing: existingClaim, deviation, decisionId, priorRounds });
  const prompt = buildPrompt(mission, deviation, evaluation);
  const orchCtx = await getOrchContext(db, orchestratorId);
  const agent = buildAgentValues(deviation, advice, orchCtx);
  agent.prompt = prompt;
  await persistHomeostasisAgent(db, agent, orchestratorId);
  const queueWrite = await persistQueueRecord({ db, decisionId, agent, orchestratorId, mission, fingerprint, deviation, priorRounds });
  if (!queueWrite.inserted) {
    const existing = await findQueueRecordById(db, decisionId);
    return idempotentContinuation({ existing, deviation, decisionId, priorRounds });
  }
  const started = await startContinuationRuntime({ db, agent, mission, orchestratorId, decisionId });
  if (!started) {
    return { targetAgentId: agent.id, deviation, decisionId, continuationRound: priorRounds + 1, exhausted: false, startFailed: true };
  }
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
  continuationFingerprint,
  countHomeostasisContinuations,
  MAX_HOMEOSTASIS_CONTINUATIONS
};
