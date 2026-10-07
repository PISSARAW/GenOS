'use strict';

const lifecycle = require('./conceptActionLifecycleService');
const kernel = require('./hierarchicalOptionService');
const gateway = require('./mcpExecutor');
const dispatch = require('./mcpExecutor/dispatch');
const { getToolRegistry } = require('./mcpExecutor/config');

function validAction(action) {
  return typeof action?.toolName === 'string' && Boolean(action.toolName.trim())
    && action.args !== null && typeof action.args === 'object' && !Array.isArray(action.args);
}

function authorize(action) {
  if (!process.env.GENOS_MCP_LEASE?.trim()) return false;
  if (!validAction(action)) return false;
  try {
    return dispatch.preValidateTool({ registry: getToolRegistry(), toolName: action.toolName,
      args: structuredClone(action.args), executionKind: 'option' }) === null;
  } catch (_) { return false; }
}

async function executeStep(context, step) {
  if (context.signal?.aborted) return { executed: false, reason: 'option_interrupted' };
  // Always use the full actor-scoped gateway, never preValidated transport.
  const result = await gateway.execute({ ...context.actor, toolName: step.action.toolName,
    args: structuredClone(step.action.args) });
  const receipt = result.conceptObservation;
  if (!lifecycle.isObserved(receipt, context.actor.agentId)) return { executed: false,
    reason: result.code || result.status || 'feedback_unavailable', attempted: result.configured === true };
  return { state: { ...step.state, interoception: receipt.after.state,
    steps: step.state.steps + 1, lastAction: { toolName: step.action.toolName,
      status: result.status, transportSuccess: result.success, domainVerdict: result.domainVerdict || 'unverified' } },
    reward: receipt.valence.actualValue };
}

async function run(option, input = {}) {
  kernel.validateOption(option);
  if (typeof input.agentId !== 'string' || !input.agentId.trim()) throw TypeError('An actor identity is required');
  const db = input.db || await require('../db').getDatabase();
  const actor = Object.freeze({ agentId: input.agentId, organizationId: input.organizationId, projectId: input.projectId });
  const sensed = await lifecycle.sense({ db, agentId: actor.agentId });
  const context = { actor, signal: input.signal };
  const state = { task: structuredClone(input.initialState || {}), interoception: sensed.state, steps: 0 };
  return kernel.runOption(option, state, {
    signal: input.signal, authorize: ({ action }) => authorize(action),
    execute: (step) => executeStep(context, step)
  });
}

module.exports = { run, authorize };
