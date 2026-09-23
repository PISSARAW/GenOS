'use strict';

/**
 * @file capabilityLearningService.js
 * @description Records outcomes per concept and predicts future utility
 * based on mission state similarity with exponential decay weighting.
 *
 * missionState is a vector: { domain, topology, complexity, urgency }
 * where each field is a normalized numeric value.
 */

// ---------------------------------------------------------------------------
// In-memory store: conceptId -> array of learning records
// ---------------------------------------------------------------------------

const MAX_RECORDS_PER_CONCEPT = 100;
const DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** @type {Map<string, Array<object>>} */
const learningStore = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_KEYS = ['domain', 'topology', 'complexity', 'urgency'];

function normalizeVector(state) {
  const v = {};
  for (const key of STATE_KEYS) {
    v[key] = Number(state[key]) || 0;
  }
  return v;
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (const key of STATE_KEYS) {
    dot += a[key] * b[key];
    magA += a[key] * a[key];
    magB += b[key] * b[key];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (const key of STATE_KEYS) {
    const diff = a[key] - b[key];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function decayWeight(timestamp, now) {
  const ageMs = now - timestamp;
  const decayConstant = Math.LN2 / DECAY_HALF_LIFE_MS;
  return Math.exp(-decayConstant * Math.max(0, ageMs));
}

function pruneOldRecords(records) {
  if (records.length <= MAX_RECORDS_PER_CONCEPT) return records;
  return records.slice(-MAX_RECORDS_PER_CONCEPT);
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

function recordOutcome(ctx) {
  if (!ctx || !ctx.conceptId) return null;

  const record = {
    conceptId: ctx.conceptId,
    missionState: normalizeVector(ctx.missionState || {}),
    wasUsed: Boolean(ctx.wasUsed),
    wasUseful: Boolean(ctx.wasUseful),
    evidenceDelta: Number(ctx.evidenceDelta) || 0,
    costIncurred: Number(ctx.costIncurred) || 0,
    timestamp: Date.now(),
  };

  const key = ctx.conceptId;
  const existing = learningStore.get(key) || [];
  existing.push(record);
  learningStore.set(key, pruneOldRecords(existing));

  return record;
}

function predictUtility(ctx) {
  if (!ctx || !ctx.conceptId) return 0;

  const records = learningStore.get(ctx.conceptId) || [];
  if (!records.length) return 0.5;

  const queryState = normalizeVector(ctx.missionState || {});
  const now = Date.now();

  let weightedSum = 0;
  let weightTotal = 0;

  for (const rec of records) {
    const sim = cosineSimilarity(queryState, rec.missionState);
    const dist = euclideanDistance(queryState, rec.missionState);
    const stateWeight = (sim + 1) / 2 * (1 / (1 + dist));
    const timeWeight = decayWeight(rec.timestamp, now);
    const combinedWeight = stateWeight * timeWeight;

    const utility = rec.wasUseful ? 1 : rec.wasUsed ? 0.3 : 0;
    weightedSum += utility * combinedWeight;
    weightTotal += combinedWeight;
  }

  if (weightTotal === 0) return 0.5;
  return weightedSum / weightTotal;
}

function getConceptStats(conceptId) {
  const records = learningStore.get(conceptId) || [];

  if (!records.length) {
    return {
      conceptId,
      uses: 0,
      successes: 0,
      avgUtility: 0,
      decayedUtility: 0,
      lastUsed: null,
    };
  }

  const uses = records.length;
  const successes = records.filter(r => r.wasUseful).length;
  const avgUtility = successes / uses;

  const now = Date.now();
  let weightedSum = 0;
  let weightTotal = 0;

  for (const rec of records) {
    const timeWeight = decayWeight(rec.timestamp, now);
    const utility = rec.wasUseful ? 1 : rec.wasUsed ? 0.3 : 0;
    weightedSum += utility * timeWeight;
    weightTotal += timeWeight;
  }

  const decayedUtility = weightTotal === 0 ? 0 : weightedSum / weightTotal;
  const lastUsed = records[records.length - 1].timestamp;

  return {
    conceptId,
    uses,
    successes,
    avgUtility: Number(avgUtility.toFixed(3)),
    decayedUtility: Number(decayedUtility.toFixed(3)),
    lastUsed,
  };
}

function getAllConceptIds() {
  return Array.from(learningStore.keys());
}

function clearAll() {
  learningStore.clear();
}

module.exports = {
  recordOutcome,
  predictUtility,
  getConceptStats,
  getAllConceptIds,
  clearAll,
  STATE_KEYS,
  _internals: { learningStore, normalizeVector, cosineSimilarity, euclideanDistance, decayWeight },
};
