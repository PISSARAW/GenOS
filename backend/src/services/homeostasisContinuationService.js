'use strict';

const crypto = require('crypto');
const telemetry = require('./telemetryObserver');
const immuneMemory = require('./immuneMemoryService');

const DEVIATION_RULES = [
  { check: (s) => s.failedInvariants && s.failedInvariants.length > 0, value: 'failed_proof' },
  { check: (s) => s.evidence && !s.evidence.satisfied, value: 'missing_work' }
];

function classifyDeviation(evaluation = {}) {
  const state = evaluation.state || {};
  for (const rule of DEVIATION_RULES) {
    if (rule.check(state)) return rule.value;
  }
  if (evaluation.status === 'evidence_missing') return 'missing_work';
  if (evaluation.status === 'unsafe') return 'unsafe_action';
  return 'incomplete';
}

function getImmuneAdvice(organismState, deviation) {
  const response = immuneMemory.immuneResponse(organismState, {
    failureCategory: `homeostasis:${deviation}`,
    strategy: 'homeostasis_continuation'
  });
  return response && response.recognized ? response.response : null;
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
  return db.get('SELECT workspace_id, fleet_id, model_tier, language, isolation_mode FROM agents WHERE id = ?', orchestratorId);
}

function resolveRole(advice) {
  if (advice && advice.preferredResponse === 'replace_worker') return 'recovery_specialist';
  return 'homeostasis_continuation';
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
  return {
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    prompt: agent.prompt,
    executionBudget: { tokens: 8000, events: 5, costUsd: 0.5 },
    executionPolicy: { allowFileEdits: true },
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
    detail: `Deviation: ${info.deviation}, role: ${info.role}`,
    payload: { missionId: info.missionId, targetAgentId: info.targetAgentId, deviation: info.deviation },
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
  await persistHomeostasisAgent(db, agent, orchestratorId);
  const { startMission } = require('./agentRuntimeAdapter');
  await startMission(buildRecoveryMission(agent, mission, orchestratorId));
  emitDispatchTelemetry({ orchestratorId, missionId: mission.id, targetAgentId: agent.id, deviation, role: agent.role });
  return { targetAgentId: agent.id, deviation, preferredResponse: agent.role };
}

module.exports = {
  classifyDeviation,
  getImmuneAdvice,
  buildPrompt,
  dispatchHomeostasisContinuation
};
