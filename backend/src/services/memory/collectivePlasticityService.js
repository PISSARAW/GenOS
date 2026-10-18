'use strict';

/**
 * @file collectivePlasticityService.js
 * @description Plasticité collective : mise à jour conjointe des poids
 * synaptiques d'un ensemble de canaux sous l'effet d'un signal global.
 */

const DEFAULT_LEARNING_RATE = 0.1;
const MIN_WEIGHT = 0.0;
const MAX_WEIGHT = 1.0;
const DEFAULT_DECAY = 0.99;
const MAX_CHANNELS = 1024;

function clamp(value) {
  return Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, value));
}

function createStore(options = {}) {
  const learningRate = Number.isFinite(options.learningRate)
    ? options.learningRate : DEFAULT_LEARNING_RATE;
  const decay = Number.isFinite(options.decay) ? options.decay : DEFAULT_DECAY;
  const maxChannels = Number(options.maxChannels) || MAX_CHANNELS;
  return Object.freeze({
    channels: new Map(),
    learningRate,
    decay,
    maxChannels
  });
}

function ensureChannel(store, channelId) {
  if (!store.channels.has(channelId)) {
    if (store.channels.size >= store.maxChannels) return null;
    store.channels.set(channelId, { weight: 0.5, lastUpdated: Date.now(), hits: 0 });
  }
  return store.channels.get(channelId);
}

function update(store, context) {
  const { channelId, signal, rate } = context;
  if (!channelId || typeof signal !== 'number') return null;
  const entry = ensureChannel(store, channelId);
  if (!entry) return null;
  const lr = Number.isFinite(rate) ? rate : store.learningRate;
  entry.weight = clamp(entry.weight + lr * signal);
  entry.hits += 1;
  entry.lastUpdated = Date.now();
  return { channelId, weight: entry.weight, hits: entry.hits };
}

function getWeight(store, channelId) {
  if (!channelId) return null;
  const entry = store.channels.get(channelId);
  if (!entry) return null;
  return { channelId, weight: entry.weight, hits: entry.hits };
}

function aggregate(store, channelIds) {
  if (!Array.isArray(channelIds) || channelIds.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const channelId of channelIds) {
    const entry = store.channels.get(channelId);
    if (entry) {
      sum += entry.weight;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

function decayAll(store) {
  const time = Date.now();
  let count = 0;
  for (const entry of store.channels.values()) {
    entry.weight = clamp(entry.weight * store.decay);
    entry.lastUpdated = time;
    count += 1;
  }
  return count;
}

function stats(store) {
  return { channels: store.channels.size, maxChannels: store.maxChannels,
    learningRate: store.learningRate, decay: store.decay };
}

module.exports = { createStore, update, getWeight, aggregate, decayAll, stats,
  DEFAULT_LEARNING_RATE, MIN_WEIGHT, MAX_WEIGHT, DEFAULT_DECAY, MAX_CHANNELS };
