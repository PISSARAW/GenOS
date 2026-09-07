/**
 * GenOS Swarm Sentinel Service
 * Active runtime supervision of cognitive entropy, infinite loop collapse,
 * and inter-agent circular deadlocks.
 */

const path = require('path');
const { calculateShannonEntropy, detectDeadlocks } = require('./swarmMetricsService');

const agentActionWindows = new Map();
const recentInteractions = [];

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

function extractActionSignature(event) {
  if (!event) return null;

  // 1. Explicit tool name (MCP or internal)
  const tool = event.payload?.toolName || event.payload?.tool_name || event.payload?.name || event.toolName;
  if (tool) return `tool:${tool}`;

  // 2. Command execution details
  const rawCmd = event.payload?.item?.command || event.payload?.command || event.item?.command || event.cmd;
  if (rawCmd) {
    const sig = normalizeCommandSignature(rawCmd);
    if (sig) return sig;
  }

  // 3. Item type (agent message, think, etc.)
  const itemType = event.payload?.item?.type || event.item?.type;
  if (itemType) {
    if (itemType === 'agent_message') return 'msg:agent_message';
    if (itemType !== 'command_execution') return `item:${itemType}`;
  }

  // 4. Action property (if non-generic)
  const genericActions = new Set(['NONE', 'EXECUTE', 'STEP', 'ACTION', 'GENERIC_ACTION']);
  const action = String(event.action || '').trim();
  if (action && !genericActions.has(action.toUpperCase())) {
    return `action:${action}`;
  }

  // 5. Specific event types
  const eventType = String(event.eventType || '').trim();
  if (eventType && !['AGENT_STEP', 'STEP', 'NONE'].includes(eventType.toUpperCase())) {
    return `event:${eventType}`;
  }

  // 6. Detail inspection for commands or specific texts
  if (typeof event.detail === 'string' && event.detail.length > 0) {
    const sig = normalizeCommandSignature(event.detail);
    if (sig) return sig;
  }

  return 'generic:action';
}

function inspectEvent(agentId, event) {
  if (!agentId || !event) return { intervention: false, action: 'NONE' };

  const signature = extractActionSignature(event);
  if (!signature) return { intervention: false, action: 'NONE' };

  if (!agentActionWindows.has(agentId)) {
    agentActionWindows.set(agentId, []);
  }
  const window = agentActionWindows.get(agentId);
  window.push(signature);
  if (window.length > 15) window.shift();

  // Evaluate Shannon entropy on recent action stream
  if (window.length >= 6) {
    const metrics = calculateShannonEntropy(window, 15);
    if (metrics.cognitiveDriftState === 'COLLAPSE_DEADLOCK') {
      return {
        intervention: true,
        action: 'HALT_COLLAPSE',
        state: 'COLLAPSE_DEADLOCK',
        normalizedEntropy: metrics.normalizedEntropy,
        rawEntropy: metrics.rawEntropy,
        reason: metrics.diagnosticRecommendation || 'Low entropy collapse: infinite repetition or frozen logic.'
      };
    }

    if (metrics.cognitiveDriftState === 'SPIKE_CONFUSION') {
      return {
        intervention: false,
        action: 'WARN_SPIKE',
        state: 'SPIKE_CONFUSION',
        normalizedEntropy: metrics.normalizedEntropy,
        rawEntropy: metrics.rawEntropy,
        reason: metrics.diagnosticRecommendation || 'High entropy spike: erratic tool hopping or hallucination loop.'
      };
    }
  }

  return { intervention: false, action: 'NONE' };
}

function recordInteraction(sender, recipient, hasDiff = false) {
  if (!sender || !recipient || sender === recipient) return null;
  const lowerRec = String(recipient).toLowerCase();
  const lowerSen = String(sender).toLowerCase();
  if (lowerRec === 'telemetry' || lowerRec === 'system' || lowerRec === 'unknown') return null;
  if (lowerSen === 'telemetry' || lowerSen === 'system' || lowerSen === 'unknown') return null;
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
