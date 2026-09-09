function getConscienceStateArgs(args) {
  const agentId = args.agent_id || args.agentId || 'griot-01';
  return { agentId };
}

async function handleConscienceState(args) {
  const agentConscience = require('./agentConscienceService');
  const { getDatabase } = require('../db');
  try {
    const db = await getDatabase();
    const state = await agentConscience.loadConscienceState(db, getConscienceStateArgs(args).agentId);
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ agentId: getConscienceStateArgs(args).agentId, conscience: state }), agentId: getConscienceStateArgs(args).agentId, conscience: state };
  } catch (e) {
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
  }
}

async function handleConscienceHistory(args) {
  const agentId = args.agent_id || args.agentId || 'griot-01';
  const limit = Number(args.limit) || 20;
  const offset = Number(args.offset) || 0;
  const agentConscience = require('./agentConscienceService');
  const { getDatabase } = require('../db');
  try {
    const db = await getDatabase();
    const transitions = await agentConscience.getConscienceTransitions(db, agentId, { limit, offset });
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ agentId, count: transitions.length, transitions }), agentId, count: transitions.length, transitions };
  } catch (e) {
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
  }
}

async function handleSwarmEntropy(args) {
  const agentId = args.agent_id || args.agentId;
  const swarmMetrics = require('./swarmMetricsService');
  const swarmSentinel = require('./swarmSentinelService');
  const { getDatabase } = require('../db');
  try {
    const db = await getDatabase();
    const events = await db.all('SELECT action as type, event_type as action, agent_id, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 50');
    const chronologicalEvents = [...events].reverse();
    const swarmEntropy = swarmMetrics.calculateShannonEntropy(chronologicalEvents);
    const agentEntropy = agentId ? swarmSentinel.getAgentEntropy(agentId) : null;
    return { configured: true, success: true, status: 'completed', transport: 'local', output: JSON.stringify({ swarmEntropy, agentEntropy }), swarmEntropy, agentEntropy };
  } catch (e) {
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
  }
}

const BIO_EXTRA_HANDLERS = {
  genos_get_conscience_state: handleConscienceState,
  genos_biomimicry_conscience_state: handleConscienceState,
  genos_get_conscience_history: handleConscienceHistory,
  genos_biomimicry_conscience_history: handleConscienceHistory,
  genos_get_swarm_entropy: handleSwarmEntropy,
  genos_biomimicry_entropy: handleSwarmEntropy,
};

async function handleBioExtraTool(toolName, args, timeoutMs) {
  const handler = BIO_EXTRA_HANDLERS[toolName];
  if (handler) return await handler(args, timeoutMs);
  return null;
}

module.exports = { handleBioExtraTool, BIO_EXTRA_HANDLERS };
