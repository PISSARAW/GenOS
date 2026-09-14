/**
 * GenOS Swarm Sentinel Service
 * Active runtime supervision of cognitive entropy, infinite loop collapse,
 * and inter-agent circular deadlocks.
 */

const path = require('path');
const { calculateShannonEntropy, detectDeadlocks } = require('./swarmMetricsService');

const agentActionWindows = new Map();
const recentInteractions = [];
const GENERIC_ACTIONS = new Set(['NONE', 'EXECUTE', 'STEP', 'ACTION', 'GENERIC_ACTION']);
const IGNORED_EVENT_TYPES = ['AGENT_STEP', 'STEP', 'NONE'];

function normalizeCommandSignature(cmd) {
  if (typeof cmd !== 'string') return null;
  const trimmed = cmd.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const bin = path.basename(parts[0]).replace(/\.(exe|cmd|bat|sh|ps1)$/i, '');
  if (parts.length > 1 && !parts[1].startsWith('-')) {
    const sub = parts[1].replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 30);
    return `cmd:${bin}:${sub}`;
  }
  return `cmd:${bin}`;
}

function readToolName(event) {
  const payload = event.payload || {};
  const tool = payload.toolName || payload.tool_name || payload.name || event.toolName;
  if (!tool) return null;
  return `tool:${tool}`;
}

function readItemCommand(container) {
  const item = container.item;
  if (!item) return null;
  const command = item.command;
  if (!command) return null;
  return command;
}

function readCommand(event) {
  const payload = event.payload || {};
  const fromPayload = readItemCommand(payload) || payload.command;
  if (fromPayload) return fromPayload;
  return readItemCommand(event) || event.cmd || null;
}

function readCommandSignature(event) {
  const rawCmd = readCommand(event);
  if (!rawCmd) return null;
  return normalizeCommandSignature(rawCmd);
}

function readType(container) {
  const item = container.item;
  if (!item) return null;
  const type = item.type;
  if (!type) return null;
  return type;
}

function readItemType(event) {
  const payload = event.payload || {};
  return readType(payload) || readType(event) || null;
}

function readItemSignature(event) {
  const itemType = readItemType(event);
  if (!itemType) return null;
  if (itemType === 'agent_message') return 'msg:agent_message';
  if (itemType !== 'command_execution') return `item:${itemType}`;
  return null;
}

function readAction(event) {
  const action = String(event.action || '').trim();
  if (!action) return null;
  if (GENERIC_ACTIONS.has(action.toUpperCase())) return null;
  return `action:${action}`;
}

function readEventType(event) {
  const eventType = String(event.eventType || '').trim();
  if (!eventType) return null;
  if (IGNORED_EVENT_TYPES.includes(eventType.toUpperCase())) return null;
  return `event:${eventType}`;
}

function readDetailSignature(event) {
  if (typeof event.detail !== 'string') return null;
  if (event.detail.length <= 0) return null;
  return normalizeCommandSignature(event.detail);
}

function extractActionSignature(event) {
  if (!event) return null;
  const tool = readToolName(event);
  if (tool) return tool;
  const commandSignature = readCommandSignature(event);
  if (commandSignature) return commandSignature;
  const itemSignature = readItemSignature(event);
  if (itemSignature) return itemSignature;
  const action = readAction(event);
  if (action) return action;
  const eventType = readEventType(event);
  if (eventType) return eventType;
  const detailSignature = readDetailSignature(event);
  if (detailSignature) return detailSignature;
  return 'generic:action';
}

function pushActionWindow(agentId, signature) {
  if (!agentActionWindows.has(agentId)) {
    agentActionWindows.set(agentId, []);
  }
  const window = agentActionWindows.get(agentId);
  window.push(signature);
  if (window.length > 15) window.shift();
  return window;
}

function buildDrift(options) {
  const metrics = options.metrics;
  const reason = metrics.diagnosticRecommendation || options.fallback;
  return {
    intervention: options.intervention,
    action: options.action,
    state: options.state,
    normalizedEntropy: metrics.normalizedEntropy,
    rawEntropy: metrics.rawEntropy,
    reason
  };
}

function buildEntropyIntervention(metrics) {
  const state = metrics.cognitiveDriftState;
  if (state === 'COLLAPSE_DEADLOCK') {
    return buildDrift({
      intervention: true,
      action: 'HALT_COLLAPSE',
      state,
      metrics,
      fallback: 'Low entropy collapse: infinite repetition or frozen logic.'
    });
  }
  if (state === 'SPIKE_CONFUSION') {
    return buildDrift({
      intervention: false,
      action: 'WARN_SPIKE',
      state,
      metrics,
      fallback: 'High entropy spike: erratic tool hopping or hallucination loop.'
    });
  }
  return null;
}

function inspectEvent(agentId, event) {
  if (!agentId || !event) return { intervention: false, action: 'NONE' };

  const signature = extractActionSignature(event);
  if (!signature) return { intervention: false, action: 'NONE' };

  const window = pushActionWindow(agentId, signature);
  if (window.length < 4) return { intervention: false, action: 'NONE' };

  const metrics = calculateShannonEntropy(window, 15);
  const outcome = buildEntropyIntervention(metrics);
  if (!outcome) return { intervention: false, action: 'NONE' };
  return outcome;
}

function isIgnoredActor(name) {
  return name === 'telemetry' || name === 'system' || name === 'unknown';
}

function isValidInteraction(sender, recipient) {
  if (!sender || !recipient || sender === recipient) return false;
  const lowerRec = String(recipient).toLowerCase();
  const lowerSen = String(sender).toLowerCase();
  if (isIgnoredActor(lowerRec)) return false;
  if (isIgnoredActor(lowerSen)) return false;
  return true;
}

function recordInteraction(sender, recipient, hasDiff = false) {
  if (!isValidInteraction(sender, recipient)) return null;
  recentInteractions.push({ sender, recipient, hasDiff, timestamp: Date.now() });
  if (recentInteractions.length > 50) recentInteractions.shift();

  return inspectMessageDeadlocks(recentInteractions);
}

function inspectMessageDeadlocks(messageQueue, threshold = 6) {
  const result = detectDeadlocks(messageQueue, threshold);
  if (result.deadlockDetected) {
    return {
      deadlockDetected: true,
      action: 'BREAK_DEADLOCK',
      circularDeadlocks: result.circularDeadlocks,
      chattyLoops: result.chattyLoops,
      recommendation: 'Break circular interaction and force artifact synthesis'
    };
  }
  return { deadlockDetected: false, action: 'NONE' };
}

function clearAgent(agentId) {
  agentActionWindows.delete(agentId);
}

function getAgentEntropy(agentId) {
  const window = agentActionWindows.get(agentId) || [];
  return calculateShannonEntropy(window, 15);
}

module.exports = {
  inspectEvent,
  recordInteraction,
  inspectMessageDeadlocks,
  clearAgent,
  getAgentEntropy
};
