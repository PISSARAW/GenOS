'use strict';

const { decideMissionAction } = require('./missionActionDecisionService');
const trust = require('./missionActionRuntimeTrust');
const budget = require('./missionActionRuntimeBudget');
const procedure = require('./missionActionProcedureService');
const provenance = require('./gvxMissionProvenance');

const POLICY = { weights: { tokens: 0.6, usd: 0.3, latencyMs: 0.1 } };
const EXECUTABLE = new Set(['procedure', 'tool', 'small_model', 'large_model']);
const PURE_TOOLS = new Set(['uncertainty_gate', 'active_refusal']);

function parse(value) {
  try { return JSON.parse(value); } catch (_) { return null; }
}

async function loadRun(db, request) {
  const row = await db.get(`SELECT r.*, c.contract_json FROM strategy_execution_runs r
    JOIN strategy_contracts c ON c.id = r.contract_id
    WHERE r.id = ? AND r.agent_id = ?`, request.executionRunId, request.agentId);
  if (!row || !['planned', 'running'].includes(row.status)) {
    throw Object.assign(new Error('No active execution run belongs to this agent.'),
      { code: 'MISSION_ACTION_RUN_REQUIRED' });
  }
  const contract = parse(row.contract_json)?.mission_outcome;
  if (!contract) throw Object.assign(new Error('Mission outcome contract is required.'),
    { code: 'MISSION_ACTION_CONTRACT_REQUIRED' });
  return { row, contract };
}

async function verifiedMissionBinding(db, request) {
  const scope = await provenance.agentScope(db, request.agentId);
  if (!scope?.organizationId || !scope.projectId) return null;
  const binding = await provenance.readRun(db, { runId: request.executionRunId, scope });
  return binding?.mission?.id === request.missionId ? binding : null;
}

function decisionInput(request, contract, remaining) {
  const actions = request.decision?.actions;
  if (!Array.isArray(actions)) throw new TypeError('Mission action candidates are required.');
  const policy = request.decision?.mode === 'active' ? POLICY : request.decision.policy || POLICY;
  return { missionId: request.missionId, contract, budget: remaining,
    policy, actions };
}

function modelOptions(context) {
  const { action, db, request, quote, binding } = context;
  const execution = action.execution || {};
  if (typeof execution.prompt !== 'string' || !execution.prompt.trim()
      || typeof execution.model !== 'string' || !execution.model.trim()) {
    throw new Error('Signed model action has no prompt or model.');
  }
  return { db, agentId: request.agentId, missionId: request.missionId,
    executionRunId: request.executionRunId, routeActionId: action.id,
    organizationId: binding.scope.organizationId, projectId: binding.scope.projectId,
    prompt: execution.prompt, model: execution.model,
    maxTokens: Math.floor(quote.components.execution.tokens.max),
    budgetMaxTokens: Math.floor(quote.reservationRequired.tokens),
    maxCostUsd: quote.reservationRequired.usd,
    timeoutMs: Math.floor(quote.reservationRequired.latencyMs),
    providerContinuity: true, stream: false };
}

async function executeTool(context) {
  const { action, db, request } = context;
  const primitive = action.execution?.primitive;
  if (!PURE_TOOLS.has(primitive)) {
    throw new Error('Signed tool action is outside the bounded primitive allowlist.');
  }
  const args = action.execution.args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Signed tool action has no argument object.');
  }
  return require('./strategyExecutionAdapter').executePrimitive(primitive,
    { ...args, db, agentId: request.agentId, orchestratorId: request.agentId });
}

async function executeAction(context) {
  const { action } = context;
  if (action.kind === 'procedure') return procedure.execute(context);
  if (action.kind === 'tool') return executeTool(context);
  if (action.kind === 'small_model' || action.kind === 'large_model') {
    return require('./modelRouter').generate(modelOptions(context));
  }
  throw Object.assign(new Error('Selected action has no verified runtime executor.'),
    { code: 'MISSION_ACTION_EXECUTOR_UNAVAILABLE' });
}

async function executeReserved(input) {
  const { db, request, decision, action, quote, binding, context, contract } = input;
  const reservation = await budget.reserve(db, { ...context, quote });
  try {
    const result = await executeAction({ action, db, request, quote, binding, contract });
    await require('./missionActionModelObservation').observe(db,
      { action, request, binding, result });
    const status = result?.success === false ? 'failed' : 'executed_unverified';
    const journal = await budget.finish(db, reservation, { status, result });
    return { status, decision, journalId: journal.id, result,
      executed: true, missionVerified: false };
  } catch (error) {
    await budget.finish(db, reservation, { status: 'uncertain', error: error.message });
    throw error;
  }
}

async function activate(input) {
  const { db, request, config, decision, decisionInputValue, context } = input;
  if (!config.key || Buffer.byteLength(config.key) < 32) {
    throw Object.assign(new Error('Mission action activation requires a configured attestation key.'),
      { code: 'MISSION_ACTION_ATTESTATION_REQUIRED' });
  }
  const binding = await verifiedMissionBinding(db, request);
  if (!binding) {
    throw Object.assign(new Error('Mission action run has no verified mission binding.'),
      { code: 'MISSION_ACTION_BINDING_REQUIRED' });
  }
  if (!decision.selectedId) return { status: 'need_evidence', decision, executed: false };
  const action = decisionInputValue.actions.find((item) => item.id === decision.selectedId);
  if (!action || !EXECUTABLE.has(action.kind)) {
    return { status: 'executor_unavailable', decision, executed: false };
  }
  const quote = decision.alternatives.find((item) => item.id === action.id).quote;
  return executeReserved({ db, request, decision, action, quote, binding, context,
    contract: decisionInputValue.contract });
}

async function procedureReadiness(db, request, contract) {
  const reasons = new Map();
  for (const action of request.decision.actions) {
    if (action.kind !== 'procedure') continue;
    const readiness = await procedure.inspect({ db, action, request, contract });
    if (readiness.status !== 'ready') reasons.set(action.id, readiness.reason);
  }
  return reasons;
}

async function run(input) {
  const { db, request, config = {} } = input;
  if (!db || !request?.executionRunId || !request?.agentId || !request?.missionId) {
    throw new TypeError('A database, executionRunId, agentId and missionId are required.');
  }
  const { row, contract } = await loadRun(db, request);
  const remaining = await budget.budgetFor(db, row);
  const decisionInputValue = decisionInput(request, contract, remaining);
  const adapters = trust.adaptersFor({ ...decisionInputValue, runId: request.executionRunId }, config.key);
  const procedureReasons = await procedureReadiness(db, request, contract);
  adapters.verifyExecutable = (action) => procedureReasons.get(action.id) || null;
  const decision = decideMissionAction(decisionInputValue, adapters);
  const context = { runId: request.executionRunId, missionId: request.missionId, decision };
  if (request.decision?.mode === 'active' && config.active === true) {
    return activate({ db, request, config, decision, decisionInputValue, context });
  }
  const journal = await budget.recordShadow(db, context);
  return { status: 'shadow', decision, journalId: journal.id, executed: false };
}

module.exports = { run };
