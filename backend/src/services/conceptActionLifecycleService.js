'use strict';

const crypto = require('node:crypto');
const machine = require('./machineInteroceptionService');
const world = require('./worldModelGenerativeService');
const valence = require('./postActionValenceService');
const { actionValue, DEFAULT_WEIGHTS } = require('./valenceService');
const { AdaptiveStateService } = require('./adaptiveStateService');
const deadline = require('./conceptObservationDeadlineService');
const pending = new WeakMap();
const observed = new WeakSet();
const FIELDS = Object.freeze({ energy: 'energy', memoryPressure: 'memory_pressure',
  socialState: 'social_state', modelDrift: 'model_drift', contextPressure: 'context_pressure',
  integrity: 'integrity', stress: 'stress' });

async function sense(context) {
  const snapshot = await machine.senseAgentRuntime(context.db, context.agentId);
  const state = Object.fromEntries(Object.entries(FIELDS).map(([key, field]) => [key, snapshot.variables[field]]));
  if (snapshot.status !== 'measured' || !valence.measuredState(state)) throw Error('Incomplete interoception');
  return { state, sampledAt: snapshot.sampledAt, sources: snapshot.sources };
}

function expectedState(model, before) {
  if (!model?.distribution?.length) return null;
  const keys = Object.keys(DEFAULT_WEIGHTS);
  const outcomes = model.distribution;
  if (outcomes.some((item) => !Number.isFinite(item.p) || item.p < 0
    || !keys.every((key) => Number.isFinite(item.delta?.[key])))) return null;
  if (Math.abs(outcomes.reduce((sum, item) => sum + item.p, 0) - 1) > 1e-9) return null;
  const predicted = Object.fromEntries(keys.map((key) => [key,
    outcomes.reduce((sum, item) => sum + item.p * (before[key] + item.delta[key]), 0)]));
  return valence.measuredState(predicted) ? predicted : null;
}

async function begin(context) {
  if (!context.db || !context.agentId || !context.actionId || !context.toolName) return { status: 'not_run', reason: 'missing_action_context' };
  const fixed = { db: context.db, agentId: context.agentId, actionId: context.actionId, action: `mcp:${context.toolName}` };
  return deadline.bounded(async (signal) => {
    const before = await sense(fixed);
    const model = await world.predictState(fixed.db, fixed.agentId, { action: fixed.action, state: before.state });
    deadline.requireActive(signal);
    const prediction = valence.predict({ actionId: fixed.actionId, before: before.state, predicted: expectedState(model, before.state) });
    const token = Object.freeze({ status: 'pending', actionId: fixed.actionId });
    pending.set(token, { ...fixed, before, prediction, model });
    return token;
  });
}

async function complete(token, outcome) {
  const action = pending.get(token);
  if (!action) return { status: 'not_run', reason: 'unknown_or_consumed_action' };
  pending.delete(token);
  const result = outcome.result;
  if (typeof result?.success !== 'boolean' || result.configured === false) return { status: 'not_run', reason: 'execution_unavailable' };
  return deadline.bounded((signal) => finish(action, outcome, signal));
}

async function finish(action, outcome, signal) {
  const after = await sense(action);
  deadline.requireActive(signal);
  const delta = Object.fromEntries(Object.keys(FIELDS).map((key) => [key, after.state[key] - action.before.state[key]]));
  const sample = await world.recordSample(action.db, action.agentId, { action: action.action, state: action.before.state, delta });
  deadline.requireActive(signal);
  const efference = await require('./efferenceCopyService').discharge(action.db, action.agentId, {
    eventType: outcome.result.success ? 'WORKFLOW_MCP_TOOL_COMPLETED' : 'WORKFLOW_MCP_TOOL_FAILED',
    payload: { sourceActionId: action.actionId }
  });
  deadline.requireActive(signal);
  const receipt = buildReceipt(action, { after, sample, efference, event: outcome.event });
  await persist(action, receipt);
  deadline.requireActive(signal);
  const frozen = freeze(receipt);
  observed.add(frozen);
  return frozen;
}

function buildReceipt(action, observation) {
  const actualValue = actionValue(action.before.state, observation.after.state);
  const predicted = valence.observe(action.prediction, { actionId: action.actionId, state: observation.after.state });
  const report = predicted.status === 'observed' ? predicted : { status: 'observed', actualValue,
    expectedValue: null, predictionError: null, predictionStatus: 'not_run', reason: 'cold_or_incomplete_model' };
  const receipt = { schema: 'genos.concept-action/v1', status: 'observed', agentId: action.agentId,
    actionId: action.actionId, action: action.action, eventId: observation.event?.id || null,
    before: action.before, after: observation.after, valence: report,
    worldModel: { sample: observation.sample, predictionSamples: action.model?.n || 0 }, efference: observation.efference,
    causalAttribution: 'not_established', promotionAllowed: false,
    limitation: 'Correlated machine-derived heuristics, not proof that this action alone caused the change.' };
  return { ...receipt, receiptHash: crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex') };
}

async function persist(action, receipt) {
  const store = new AdaptiveStateService(action.db);
  const state = await store.restoreObject('concept_action_lifecycle', action.agentId) || {};
  const receipts = [...(state.receipts || []), receipt].slice(-64);
  await store.persistObject('concept_action_lifecycle', action.agentId, { receipts }, receipts.length);
}

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function isObserved(receipt, agentId) {
  return observed.has(receipt) && (agentId === undefined || receipt.agentId === agentId);
}

module.exports = { begin, complete, sense, isObserved, expectedState };
