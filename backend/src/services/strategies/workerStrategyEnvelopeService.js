'use strict';

const { getStrategy } = require('../../strategies/strategyRegistry');

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeIdList(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function createEnvelope(ctx) {
  const {
    workerId,
    inheritedObjective,
    parentStrategy,
    allowedStrategies,
    forbiddenStrategies,
    maxChanges,
    localBudget,
  } = ctx || {};
  if (!workerId) throw new Error('workerId is required');
  if (!inheritedObjective) throw new Error('inheritedObjective is required');
  if (!parentStrategy) throw new Error('parentStrategy is required');
  const parentDef = typeof parentStrategy === 'string' ? getStrategy(parentStrategy) : parentStrategy;
  if (!parentDef) throw new Error(`Unknown parentStrategy: ${parentStrategy}`);
  const allowed = normalizeIdList(allowedStrategies);
  const forbidden = normalizeIdList(forbiddenStrategies);
  const overlap = allowed.filter((id) => forbidden.includes(id));
  if (overlap.length) throw new Error(`Strategies in both allowed and forbidden: ${overlap.join(', ')}`);
  return {
    id: generateId('envelope'),
    workerId,
    inheritedObjective,
    parentStrategyId: parentDef.id,
    currentStrategyId: parentDef.id,
    allowedStrategies: allowed.length ? allowed : [parentDef.id],
    forbiddenStrategies: forbidden,
    maxChanges: Number.isFinite(maxChanges) ? maxChanges : 3,
    changesUsed: 0,
    localBudget: localBudget || {},
    createdAt: new Date().toISOString(),
  };
}

function getEnvelope(workerId) {
  if (!global.__workerEnvelopes) global.__workerEnvelopes = new Map();
  return global.__workerEnvelopes.get(workerId) || null;
}

function saveEnvelope(envelope) {
  if (!global.__workerEnvelopes) global.__workerEnvelopes = new Map();
  global.__workerEnvelopes.set(envelope.workerId, envelope);
  return envelope;
}

function registerEnvelope(ctx) {
  const envelope = createEnvelope(ctx);
  return saveEnvelope(envelope);
}

function isStrategyAllowed(envelope, newStrategyId) {
  if (!envelope) return false;
  if (envelope.forbiddenStrategies.includes(newStrategyId)) return false;
  if (envelope.allowedStrategies.includes(newStrategyId)) return true;
  return envelope.allowedStrategies.includes('all');
}

function canChangeStrategy(workerId, newStrategyId) {
  const envelope = getEnvelope(workerId);
  if (!envelope) return false;
  if (!isStrategyAllowed(envelope, newStrategyId)) return false;
  if (envelope.currentStrategyId === newStrategyId) return true;
  if (envelope.changesUsed >= envelope.maxChanges) return false;
  const strategy = getStrategy(newStrategyId);
  if (!strategy) return false;
  return true;
}

function changeStrategy(ctx) {
  const { workerId, newStrategy, reason } = ctx || {};
  if (!workerId) throw new Error('workerId is required');
  if (!newStrategy) throw new Error('newStrategy is required');
  const envelope = getEnvelope(workerId);
  if (!envelope) throw new Error(`No envelope for worker: ${workerId}`);
  const strategyDef = typeof newStrategy === 'string' ? getStrategy(newStrategy) : newStrategy;
  if (!strategyDef) throw new Error(`Unknown strategy: ${newStrategy}`);
  if (envelope.currentStrategyId === strategyDef.id) {
    return { envelope, changed: false, reason: 'already using this strategy' };
  }
  if (!isStrategyAllowed(envelope, strategyDef.id)) {
    throw new Error(`Strategy ${strategyDef.id} is not in worker's allowed set`);
  }
  if (envelope.changesUsed >= envelope.maxChanges) {
    throw new Error(`Worker ${workerId} has exhausted its ${envelope.maxChanges} strategy changes`);
  }
  const previousStrategyId = envelope.currentStrategyId;
  envelope.currentStrategyId = strategyDef.id;
  envelope.changesUsed += 1;
  envelope.lastChangeReason = reason || null;
  envelope.lastChangeAt = new Date().toISOString();
  return {
    envelope,
    changed: true,
    previousStrategyId,
    newStrategyId: strategyDef.id,
    reason: reason || null,
  };
}

module.exports = {
  createEnvelope,
  registerEnvelope,
  canChangeStrategy,
  changeStrategy,
  getEnvelope,
};
