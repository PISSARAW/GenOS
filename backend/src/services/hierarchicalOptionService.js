'use strict';

const crypto = require('node:crypto');

function validateOption(option) {
  const functions = ['initiation', 'policy', 'termination'];
  if (!option?.id || functions.some((key) => typeof option[key] !== 'function')) {
    throw new TypeError('Options require identity, initiation, policy and termination functions.');
  }
  if (!Number.isSafeInteger(option.maxSteps) || option.maxSteps < 1 || option.maxSteps > 32) {
    throw new TypeError('Option step budget must be between 1 and 32.');
  }
}

async function stepOption(option, state, runtime) {
  const action = structuredClone(await option.policy(structuredClone(state)));
  const allowed = await runtime.authorize({ optionId: option.id, action: structuredClone(action), state: structuredClone(state) });
  if (allowed !== true) return { status: 'blocked', state, reason: 'action_not_authorized' };
  if (runtime.signal?.aborted) return { status: 'interrupted', state, reason: 'option_interrupted' };
  const result = await runtime.execute({ optionId: option.id, action: structuredClone(action), state: structuredClone(state), signal: runtime.signal });
  if (result?.executed === false) return { status: 'blocked', state, reason: result.reason || 'executor_refused', attempted: result.attempted === true };
  if (result?.state === undefined || !Number.isFinite(result.reward)) {
    throw new TypeError('An option step requires observed state and finite reward.');
  }
  return { status: 'observed', action, state: structuredClone(result.state), reward: result.reward };
}

async function runOption(option, initialState, runtime) {
  validateOption(option);
  option = Object.freeze({ ...option });
  validateRuntime(runtime);
  runtime = Object.freeze({ ...runtime });
  let state = structuredClone(initialState);
  if (!await option.initiation(state)) return { status: 'not_applicable', optionId: option.id, trajectory: [] };
  const trajectory = [];
  let status = 'budget_exhausted';
  for (let index = 0; index < option.maxSteps; index += 1) {
    if (runtime.signal?.aborted) { status = 'interrupted'; break; }
    if (await option.termination(structuredClone(state))) { status = 'terminated'; break; }
    const step = await stepOption(option, state, runtime);
    trajectory.push(step);
    state = step.state;
    if (step.status !== 'observed') { status = step.status; break; }
  }
  if (status === 'budget_exhausted' && await option.termination(structuredClone(state))) status = 'terminated';
  const receipt = { optionId: option.id, status, state, trajectory,
    steps: trajectory.filter((step) => step.status === 'observed').length,
    reward: trajectory.reduce((sum, step) => sum + (step.reward || 0), 0), promotionAllowed: false };
  return { ...receipt, receiptHash: crypto.createHash('sha256').update(JSON.stringify(receipt)).digest('hex') };
}

function validateRuntime(runtime) {
  if (typeof runtime?.authorize !== 'function' || typeof runtime.execute !== 'function') {
    throw new TypeError('Options require a lease-aware authorized executor.');
  }
}

function runMcpOption(option, input) { return require('./mcpOptionControlService').run(option, input); }

module.exports = { runOption, runMcpOption, validateOption };
