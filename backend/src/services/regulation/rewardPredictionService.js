'use strict';

function predictReward(action, context) {
  const base = context?.expectedReward || 0.5;
  const risk = context?.risk || 0;
  const novelty = context?.novelty || 0;
  return Math.max(0, Math.min(1, base + novelty * 0.2 - risk * 0.3));
}

function computeRPE(actual, predicted) {
  return (actual || 0) - (predicted || 0);
}

function getRewardHistory(agentId) {
  const store = getStore(agentId);
  return store || [];
}

const stores = new Map();
function getStore(agentId) {
  return stores.get(agentId) || [];
}

function recordReward(agentId, predicted, actual) {
  const store = getStore(agentId);
  store.push({ predicted, actual, rpe: computeRPE(actual, predicted), ts: Date.now() });
  if (store.length > 100) store.shift();
  stores.set(agentId, store);
}

module.exports = { predictReward, computeRPE, getRewardHistory, recordReward };
