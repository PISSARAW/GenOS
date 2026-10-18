'use strict';

/**
 * @file mcpMemoryTools.js
 * @description Handlers MCP pour les cinq services de mémoire, apprentissage
 * et plasticité : mémoire de travail, mémoire ancestrale, héritage de risque,
 * plasticité collective et teaching worker.
 */

const { createStore: createWorkingMemory,
  memorize: wmMemorize, recall: wmRecall, forget: wmForget, stats: wmStats,
  pruneStore: wmPrune } = require('./memory/workingMemoryService');
const lineageMemory = require('./memory/lineageMemoryRepository');
const { createStore: createCollectivePlasticity,
  update: cpUpdate, getWeight: cpGetWeight, aggregate: cpAggregate,
  decayAll: cpDecayAll, stats: cpStats } = require('./memory/collectivePlasticityService');
const { teach, verifyTransfer } = require('./memory/teachingWorkerService');

const stores = new Map();

function storeFor(name, create) {
  if (!stores.has(name)) stores.set(name, create());
  return stores.get(name);
}

function firstTruthy(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function nullish(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function output(success, payload) {
  return { configured: true, success, status: success ? 'completed' : 'tool_error',
    transport: 'memory_tool', output: payload };
}

// ── Mémoire de travail ──────────────────────────────────────────────

function wmActionMemorize(store, args) {
  const key = firstTruthy(args.key);
  if (!key) return output(false, { error: 'key requis pour memorize' });
  return output(true, { memorized: wmMemorize(store, key, {
    value: args.value,
    ttlMs: nullish(args.ttlMs, undefined)
  }), key });
}

function wmActionRecall(store, args) {
  const key = firstTruthy(args.key);
  if (!key) return output(false, { error: 'key requis pour recall' });
  const value = wmRecall(store, key);
  return output(true, { key, value, found: value !== undefined });
}

function wmActionForget(store, args) {
  const key = firstTruthy(args.key);
  if (!key) return output(false, { error: 'key requis pour forget' });
  return output(true, { key, forgotten: wmForget(store, key) === 1 });
}

function wmActionPrune(store) {
  wmPrune(store);
  return output(true, wmStats(store));
}

function handleWorkingMemory(args) {
  const store = storeFor('working_memory', createWorkingMemory);
  const action = firstTruthy(args.action);
  switch (action) {
    case 'memorize': return wmActionMemorize(store, args);
    case 'recall': return wmActionRecall(store, args);
    case 'forget': return wmActionForget(store, args);
    case 'prune': return wmActionPrune(store);
    case 'stats':
    default: return output(true, wmStats(store));
  }
}

// ── Mémoire ancestrale ──────────────────────────────────────────────

function amRequireLineage(args) {
  const lineageId = firstTruthy(args.lineageId);
  if (!lineageId) return output(false, { error: 'lineageId requis' });
  return null;
}

async function amActionMemorize(args) {
  const memoryId = firstTruthy(args.memoryId);
  const ancestorId = firstTruthy(args.ancestorId);
  if (!memoryId || !ancestorId) return output(false, { error: 'memoryId et ancestorId requis' });
  const memorized = await lineageMemory.memorize({ ...args, memoryId, ancestorId });
  return output(true, { memorized, memoryId, persistence: 'sqlite' });
}

async function amActionRecall(args) {
  const memories = await lineageMemory.recall(args);
  return output(true, { lineageId: args.lineageId, memories,
    count: memories.length, persistence: 'sqlite' });
}

async function amActionForget(args) {
  const memoryId = firstTruthy(args.memoryId);
  if (!memoryId) return output(false, { error: 'memoryId requis pour forget' });
  const forgotten = await lineageMemory.forget({ ...args, memoryId });
  return output(true, { lineageId: args.lineageId, memoryId,
    forgotten: forgotten === 1, persistence: 'sqlite' });
}

async function handleAncestralMemory(args) {
  const error = amRequireLineage(args);
  if (error) return error;
  const action = firstTruthy(args.action);
  switch (action) {
    case 'memorize': return amActionMemorize(args);
    case 'recall': return amActionRecall(args);
    case 'forget': return amActionForget(args);
    case 'stats':
    default: return output(true, await lineageMemory.ancestralStats(args));
  }
}

// ── Héritage de risque ──────────────────────────────────────────────

function riRequireLineage(args) {
  const lineageId = firstTruthy(args.lineageId);
  if (!lineageId) return output(false, { error: 'lineageId requis' });
  return null;
}

async function riActionPropagate(args) {
  const sourceId = firstTruthy(args.sourceId);
  const targetId = firstTruthy(args.targetId);
  const risk = args.risk;
  if (!sourceId || !targetId || typeof risk !== 'number') {
    return output(false, { error: 'sourceId, targetId et risk (0-1) requis' });
  }
  const propagated = await lineageMemory.propagateRisk({ ...args,
    sourceId, targetId, risk, depth: nullish(args.depth, 0) });
  return output(true, { propagated, targetId, persistence: 'sqlite' });
}

async function riActionGetRisk(args) {
  const agentId = firstTruthy(args.targetId, args.agentId);
  if (!agentId) return output(false, { error: 'targetId/agentId requis' });
  const inherited = await lineageMemory.getRisk({ ...args, targetId: agentId });
  return output(true, inherited);
}

async function riActionDecay(args) {
  const factor = nullish(args.factor, 0.9);
  const decayed = await lineageMemory.decayRisks({ ...args, factor });
  return output(true, { decayed, factor, persistence: 'sqlite' });
}

async function handleRiskInheritance(args) {
  const error = riRequireLineage(args);
  if (error) return error;
  const action = firstTruthy(args.action);
  switch (action) {
    case 'propagate': return riActionPropagate(args);
    case 'getRisk': return riActionGetRisk(args);
    case 'decay': return riActionDecay(args);
    case 'stats':
    default: return output(true, await lineageMemory.riskStats(args));
  }
}

// ── Plasticité collective ───────────────────────────────────────────

function cpActionUpdate(store, args) {
  const channelId = firstTruthy(args.channelId);
  const signal = args.signal;
  if (!channelId || typeof signal !== 'number') {
    return output(false, { error: 'channelId et signal (nombre) requis' });
  }
  return output(true, cpUpdate(store, { channelId, signal, rate: args.rate }));
}

function cpActionGetWeight(store, args) {
  const channelId = firstTruthy(args.channelId);
  if (!channelId) return output(false, { error: 'channelId requis' });
  return output(true, cpGetWeight(store, channelId));
}

function cpActionAggregate(store, args) {
  return output(true, { average: cpAggregate(store, args.channelIds || []),
    channels: args.channelIds || [] });
}

function cpActionDecayAll(store) {
  return output(true, { decayed: cpDecayAll(store) });
}

function handleCollectivePlasticity(args) {
  const store = storeFor('collective_plasticity', createCollectivePlasticity);
  const action = firstTruthy(args.action);
  switch (action) {
    case 'update': return cpActionUpdate(store, args);
    case 'getWeight': return cpActionGetWeight(store, args);
    case 'aggregate': return cpActionAggregate(store, args);
    case 'decayAll': return cpActionDecayAll(store);
    case 'stats':
    default: return output(true, cpStats(store));
  }
}

// ── Teaching worker ─────────────────────────────────────────────────

function twRequireInput(args) {
  const input = args.input;
  if (!Array.isArray(input)) return output(false, { error: 'input (tableau de nombres) requis' });
  return null;
}

function twActionTeach(args) {
  const target = args.target;
  if (typeof target !== 'number') return output(false, { error: 'target (nombre) requis' });
  return output(true, teach({ procedureId: args.procedureId,
    demonstration: args.demonstration, learnerIndices: args.learnerIndices || [],
    input: args.input, target }));
}

function twActionVerifyTransfer(args) {
  const target = args.target;
  if (typeof target !== 'number') return output(false, { error: 'target (nombre) requis' });
  return output(true, { transferVerified: verifyTransfer(args.input, args.learnerIndices || [], target),
    input: args.input, target, learnerIndices: args.learnerIndices || [] });
}

function handleTeachingWorker(args) {
  const error = twRequireInput(args);
  if (error) return error;
  const action = firstTruthy(args.action);
  switch (action) {
    case 'teach': return twActionTeach(args);
    case 'verifyTransfer': return twActionVerifyTransfer(args);
    default: return output(false, { error: 'action inconnue (teach|verifyTransfer)' });
  }
}

module.exports = {
  handleWorkingMemory, handleAncestralMemory, handleRiskInheritance,
  handleCollectivePlasticity, handleTeachingWorker
};
