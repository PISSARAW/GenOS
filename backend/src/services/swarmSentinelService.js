/**
 * GenOS Swarm Sentinel Service
 * Active runtime supervision of cognitive entropy, infinite loop collapse,
 * and inter-agent circular deadlocks.
 */

const { calculateShannonEntropy, detectDeadlocks } = require('./swarmMetricsService');

const agentActionWindows = new Map();
const recentInteractions = [];

function extractActionSignature(event) {
  if (!event) return null;
  if (event.payload?.toolName) return `tool:${event.payload.toolName}`;
  if (event.action && event.action !== 'NONE') return `action:${event.action}`;
  if (event.eventType && event.eventType.startsWith('WORKFLOW_')) return `workflow:${event.eventType}`;
  return null;
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
