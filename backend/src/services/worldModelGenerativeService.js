'use strict';

const { AdaptiveStateService } = require('./adaptiveStateService');
const KEYS = ['filesChanged', 'testsPassed', 'testsFailed', 'costUsd', 'latencyMs', 'agentsActive', 'evidenceCount',
  ...Object.keys(require('./valenceService').DEFAULT_WEIGHTS)];
const SCOPE = 'world_model';

function encodeWorldState(input) {
  if (!input || typeof input !== 'object') return null;
  const out = Object.fromEntries(KEYS.filter((key) => Number.isFinite(input[key])).map((key) => [key, input[key]]));
  if (typeof input.success === 'boolean') out.success = input.success;
  return Object.keys(out).length ? out : null;
}

function validAction(agentId, data) {
  return Boolean(agentId && typeof data?.action === 'string' && data.action.trim());
}

async function recordSample(db, agentId, sample) {
  if (!validAction(agentId, sample)) return null;
  const delta = encodeWorldState(sample.delta);
  if (!delta) return null;
  const state = encodeWorldState(sample.state);
  const store = new AdaptiveStateService(db);
  const stored = (await store.restoreObject(SCOPE, agentId)) || {};
  const samples = Array.isArray(stored.samples) ? stored.samples : [];
  const action = sample.action.trim().slice(0, 120);
  const bounded = [...samples, { action, state, delta, at: new Date().toISOString() }].slice(-150);
  await store.persistObject(SCOPE, agentId, { ...stored, samples: bounded }, bounded.length);
  return { action, samples: bounded.length };
}

function stateKey(state) {
  return JSON.stringify(Object.entries(state || {}).sort(([a], [b]) => a.localeCompare(b)));
}

function sampleDistribution(samples) {
  const counts = new Map();
  for (const entry of samples) {
    const key = stateKey(entry.delta);
    const prior = counts.get(key) || { delta: entry.delta, count: 0 };
    counts.set(key, { delta: prior.delta, count: prior.count + 1 });
  }
  return [...counts.values()].map(({ delta, count }) => ({ delta, p: count / samples.length }))
    .sort((a, b) => b.p - a.p);
}

function distributionFor(samples, input) {
  const state = encodeWorldState(input.state);
  const eligible = samples.filter((sample) => sample.action === input.action);
  const conditioned = state ? eligible.filter((sample) => stateKey(sample.state) === stateKey(state)) : eligible;
  if (!conditioned.length) return null;
  const distribution = sampleDistribution(conditioned);
  const outcomes = conditioned.filter((entry) => typeof entry.delta.success === 'boolean');
  return { action: input.action, state, distribution, uncertainty: 1 - distribution[0].p,
    successRate: outcomes.length ? outcomes.filter((entry) => entry.delta.success).length / outcomes.length : null,
    n: conditioned.length, model: state ? 'empirical-state-conditioned' : 'empirical-action-marginal' };
}

async function predictState(db, agentId, input) {
  if (!validAction(agentId, input)) return null;
  const stored = (await new AdaptiveStateService(db).restoreObject(SCOPE, agentId)) || {};
  return distributionFor(Array.isArray(stored.samples) ? stored.samples : [], input);
}

function nextState(state, delta) {
  const next = { ...(state || {}) };
  for (const [key, value] of Object.entries(delta)) {
    next[key] = typeof value === 'boolean' ? value : (next[key] || 0) + value;
  }
  return next;
}

function expandNode(node, context) {
  for (const action of context.actions) {
    const predicted = distributionFor(context.samples, { action, state: node.state });
    const outcomes = predicted?.distribution || [{ delta: null, p: null }];
    for (const outcome of outcomes) {
      if (context.total >= context.maxNodes) { context.truncated = true; return; }
      const state = outcome.delta ? nextState(node.state, outcome.delta) : null;
      const child = { action, predicted, state, depth: node.depth + 1,
        probability: outcome.p === null ? null : node.probability * outcome.p, children: [] };
      node.children.push(child);
      context.total += 1;
      if (predicted && child.depth < context.depth) context.frontier.push(child);
    }
  }
}

async function rolloutFree(db, agentId, input = {}) {
  const actions = normalizedActions(input.actions);
  if (!agentId || !actions.length) return null;
  const stored = (await new AdaptiveStateService(db).restoreObject(SCOPE, agentId)) || {};
  const root = { action: null, state: encodeWorldState(input.state), depth: 0, probability: 1, children: [] };
  const context = { actions, samples: stored.samples || [], frontier: [root], total: 0, truncated: false,
    maxNodes: 13, depth: Math.max(1, Math.min(3, Math.floor(Number(input.depth) || 2))) };
  while (context.frontier.length && context.total < context.maxNodes) expandNode(context.frontier.shift(), context);
  return { ...root, generatedNodes: context.total,
    budgetTruncated: context.truncated || context.frontier.length > 0,
    limitation: 'Bounded empirical generative model; unseen state/action pairs are not extrapolated.' };
}

function normalizedActions(actions) {
  return Array.isArray(actions) ? [...new Set(actions.filter((action) => typeof action === 'string' && action))] : [];
}

module.exports = { encodeWorldState, recordSample, predictState, rolloutFree, nextState };
