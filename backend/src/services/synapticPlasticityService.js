/**
 * Synaptic Plasticity Service — route reinforcement learning
 */

const channelWeights = new Map();
let hydration = null;
let persistenceQueue = Promise.resolve();
const persistenceErrors = [];

const DEFAULT_WEIGHT = 0.5;
const REINFORCEMENT = 0.1;
const DEPRESSION = 0.05;
const STRONG_DEPRESSION = 0.15;
const MIN_WEIGHT = 0.0;
const MAX_WEIGHT = 1.0;

function channelKey(senderId, receiverId) {
  return `${senderId || 'system'}→${receiverId || 'broadcast'}`;
}

async function loadWeights(db) {
  if (!hydration) hydration = (async () => {
    const database = db || await require('../db').getDatabase();
    const rows = await database.all('SELECT channel, weight, last_updated, hits, misses, last_signal_type FROM signal_channel_weights');
    for (const row of rows) channelWeights.set(row.channel, {
      weight: Number(row.weight), lastUpdated: Number(row.last_updated), hits: Number(row.hits),
      misses: Number(row.misses), lastSignalType: row.last_signal_type || undefined
    });
  })().catch((error) => { hydration = null; throw error; });
  return hydration;
}

function persistChannel(senderId, receiverId) {
  const key = channelKey(senderId, receiverId);
  const channel = channelWeights.get(key);
  if (!channel) return;
  const snapshot = { ...channel };
  persistenceQueue = persistenceQueue.then(async () => {
    const db = await require('../db').getDatabase();
    await db.run(`INSERT INTO signal_channel_weights
      (channel, weight, last_updated, hits, misses, last_signal_type) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(channel) DO UPDATE SET weight=excluded.weight, last_updated=excluded.last_updated,
      hits=excluded.hits, misses=excluded.misses, last_signal_type=excluded.last_signal_type`,
    [key, snapshot.weight, snapshot.lastUpdated, snapshot.hits, snapshot.misses, snapshot.lastSignalType || null]);
  }).catch((error) => {
    persistenceErrors.push(error);
    console.warn(`[Plasticity] Weight persistence failed: ${error.message}`);
  });
}

async function flushPendingWrites() {
  await persistenceQueue;
  const error = persistenceErrors.shift();
  if (error) throw error;
}

function getChannelWeight(senderId, receiverId) {
  const key = channelKey(senderId, receiverId);
  if (!channelWeights.has(key)) {
    channelWeights.set(key, { weight: DEFAULT_WEIGHT, lastUpdated: Date.now(), hits: 0, misses: 0 });
  }
  return channelWeights.get(key);
}

function reinforce(senderId, receiverId, signalType) {
  const channel = getChannelWeight(senderId, receiverId);
  channel.weight = Math.min(MAX_WEIGHT, channel.weight + REINFORCEMENT);
  channel.hits++;
  channel.lastUpdated = Date.now();
  channel.lastSignalType = signalType;
  return channel;
}

function depress(senderId, receiverId, signalType) {
  const channel = getChannelWeight(senderId, receiverId);
  channel.weight = Math.max(MIN_WEIGHT, channel.weight - DEPRESSION);
  channel.misses++;
  channel.lastUpdated = Date.now();
  channel.lastSignalType = signalType;
  return channel;
}

function strongDepress(senderId, receiverId, signalType) {
  const channel = getChannelWeight(senderId, receiverId);
  channel.weight = Math.max(MIN_WEIGHT, channel.weight - STRONG_DEPRESSION);
  channel.misses += 2;
  channel.lastUpdated = Date.now();
  channel.lastSignalType = signalType;
  return channel;
}

function recordSignalOutcome({ senderId, receiverId, outcome, signalType }) {
  let result;
  switch (outcome) {
    case 'useful':
    case 'action_taken':
    case 'receptor_triggered':
      result = reinforce(senderId, receiverId, signalType); break;
    case 'error':
    case 'noise':
    case 'suppressed':
      result = strongDepress(senderId, receiverId, signalType); break;
    case 'no_effect':
    case 'ignored':
    default:
      result = depress(senderId, receiverId, signalType);
  }
  persistChannel(senderId, receiverId);
  return result;
}

function getTopChannels(limit = 10) {
  return [...channelWeights.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, limit)
    .map(([key, data]) => ({ channel: key, ...data }));
}

function getWeakChannels(threshold = 0.05) {
  return [...channelWeights.entries()]
    .filter(([_, data]) => data.weight <= threshold)
    .map(([key, data]) => ({ channel: key, ...data }));
}

function pruneWeakChannels(threshold = 0.05) {
  const pruned = [];
  for (const [key, data] of channelWeights) {
    if (data.weight <= threshold) {
      channelWeights.delete(key);
      pruned.push(key);
    }
  }
  return pruned;
}

function getAllWeights() {
  const result = {};
  for (const [key, data] of channelWeights) {
    result[key] = { ...data };
  }
  return result;
}

function resetWeights() {
  channelWeights.clear();
}

module.exports = {
  reinforce,
  depress,
  strongDepress,
  recordSignalOutcome,
  getChannelWeight,
  getTopChannels,
  getWeakChannels,
  pruneWeakChannels,
  getAllWeights,
  resetWeights,
  loadWeights,
  flushPendingWrites,
  DEFAULT_WEIGHT,
  REINFORCEMENT,
  DEPRESSION,
  STRONG_DEPRESSION,
  MIN_WEIGHT,
  MAX_WEIGHT,
};
