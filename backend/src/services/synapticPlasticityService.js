/**
 * Synaptic Plasticity Service — route reinforcement learning
 */

const channelWeights = new Map();

const DEFAULT_WEIGHT = 0.5;
const REINFORCEMENT = 0.1;
const DEPRESSION = 0.05;
const STRONG_DEPRESSION = 0.15;
const MIN_WEIGHT = 0.0;
const MAX_WEIGHT = 1.0;

function channelKey(senderId, receiverId) {
  return `${senderId || 'system'}→${receiverId || 'broadcast'}`;
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
  switch (outcome) {
    case 'useful':
    case 'action_taken':
    case 'receptor_triggered':
      return reinforce(senderId, receiverId, signalType);
    case 'error':
    case 'noise':
    case 'suppressed':
      return strongDepress(senderId, receiverId, signalType);
    case 'no_effect':
    case 'ignored':
    default:
      return depress(senderId, receiverId, signalType);
  }
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
  DEFAULT_WEIGHT,
  REINFORCEMENT,
  DEPRESSION,
  STRONG_DEPRESSION,
  MIN_WEIGHT,
  MAX_WEIGHT,
};
