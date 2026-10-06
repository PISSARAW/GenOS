'use strict';

const rhizomeTick = require('./rhizomeTick');
const homeostasisController = require('./homeostasisController');
const rhizome = require('../../rhizomeCoordinationService');
const variantPolicies = require('../variants/variantPolicyService');
const { normalizeCapabilityNeed } = require('../contracts/capabilityNeed');

function normalizeNeeds(input) {
  if (!Array.isArray(input.needs)) {
    throw Object.assign(new Error('Rhizome runtime requires an ordered needs array.'), { code: 'RHIZOME_RUNTIME_NEEDS_REQUIRED' });
  }
  const needs = input.needs.map(normalizeCapabilityNeed);
  const contracts = new Map();
  for (const need of needs) {
    const text = JSON.stringify(need);
    if (contracts.has(need.needId) && contracts.get(need.needId) !== text) {
      throw Object.assign(new Error('A need identifier cannot refer to different contracts.'), { code: 'RHIZOME_RUNTIME_NEED_CONFLICT' });
    }
    contracts.set(need.needId, text);
  }
  return needs;
}

function tickLimit(input, count) {
  return Math.max(1, Math.min(1000, Number(input.maxTicks) || count * 2 || 1));
}

async function run(input) {
  const needs = normalizeNeeds(input);
  const maximum = tickLimit(input, needs.length);
  const state = { input, needs, maximum, results: [], pending: [...needs], homeostasis: homeostasisController.create() };
  const storedPolicy = await rhizome.getVariantPolicy(input.sessionId, input.options || {});
  state.activeVariant = input.variant || storedPolicy.name;
  const deadline = missionDeadline(input);
  while (state.pending.length && state.results.length < maximum) {
    if (Date.now() >= deadline) return finish(state, 'TIME_BUDGET');
    const need = state.pending.shift();
    const result = await tickWithinDeadline({ ...input, need, deadline });
    if (result.deadlineExceeded) return finish(state, 'TIME_BUDGET');
    result.homeostasis = state.homeostasis.observe(result, input);
    state.activeVariant = await applyVariant(input, state.activeVariant, result.homeostasis);
    state.results.push(result);
    if (result.status === 'GROWTH_ADMITTED_ROUTE_READY') state.pending.unshift(need);
    if (await stopRequested(input.stopWhen, result)) return finish(state, 'STOP_CONDITION');
  }
  const reason = state.pending.length ? 'MAX_TICKS' : exhaustedReason(state);
  return finish(state, reason);
}

function missionDeadline(input) {
  const duration = input.maxDurationMs ?? 60000;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw Object.assign(new Error('Mission duration must be finite and positive.'), { code: 'RHIZOME_TIME_BUDGET_INVALID' });
  }
  return Date.now() + duration;
}

async function tickWithinDeadline(input) {
  try { return await rhizomeTick.tick(input); } catch (error) {
    if (error.code === 'RHIZOME_DEADLINE_EXCEEDED') return { deadlineExceeded: true };
    throw error;
  }
}

function exhaustedReason(state) {
  const last = state.results.at(-1);
  const threshold = variantPolicies.resolve(state.activeVariant).stop.stableTicks;
  return last?.homeostasis.stableTicks >= threshold ? 'STABLE_TICKS' : 'NEEDS_EXHAUSTED';
}

async function finish(state, stopReason) {
  const completion = await rhizome.missionMetrics(state.input.sessionId, {
    ...(state.input.options || {}), needs: state.needs,
    trustedVerifierDigests: state.input.trustedVerifierDigests, policy: state.input.convergencePolicy
  });
  const complete = !completion.unresolvedNeedIds.length && completion.canMerge;
  return { results: state.results, stopReason, completion, status: complete ? 'VERIFIED' : 'INCOMPLETE' };
}

async function applyVariant(input, activeVariant, homeostasis) {
  if (input.dynamicVariants === false || activeVariant === homeostasis.recommendedVariant) return activeVariant;
  if (['private', 'persistent', 'cross_representation', 'procedural'].includes(activeVariant)) return activeVariant;
  await rhizome.setVariant(input.sessionId, homeostasis.recommendedVariant, input.options || {});
  homeostasis.activeVariant = homeostasis.recommendedVariant;
  return homeostasis.recommendedVariant;
}

async function stopRequested(stopWhen, result) {
  return typeof stopWhen === 'function' && Boolean(await stopWhen(result));
}

module.exports = { run };
