'use strict';

const bridge = require('./runtimeBridge');
const { scopeOf, identifier } = require('./contract');

function selection(request) {
  const limit = request.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Invalid history limit');
  if (request.agentIds === undefined) return { limit };
  if (!Array.isArray(request.agentIds) || request.agentIds.length > 128) throw new TypeError('Invalid agent selection');
  return { limit, agentIds: [...new Set(request.agentIds.map(id => identifier(id, 'agentId')))] };
}

function sourceFor(agent, history) {
  const entry = history.find(({ signal, receipt }) => signal.agentId === agent.agentId
    && signal.observedAt === agent.lastObservedAt && receipt.disposition !== 'HISTORICAL');
  if (!entry) return null;
  if (agent.mode === 'UNKNOWN' && agent.pressure === null && agent.coverage === null) return null;
  return { signalId: entry.signal.id, sourceEventId: entry.signal.eventId,
    observedAt: entry.signal.observedAt, receipt: entry.receipt, evidenceStatus: 'UNVERIFIED' };
}

async function readAvailable(request) {
  const scope = scopeOf(request.scope);
  const options = selection(request);
  if (!request.db) throw new TypeError('Source database required');
  const runtime = await bridge.getRuntime(request.db);
  const [snapshot, history] = await Promise.all([
    runtime.snapshot(scope, { agentIds: options.agentIds, limit: 129 }), runtime.store.history(scope, options)
  ]);
  if (snapshot.agents.length > 128) throw new Error('CONSUMER_AGENT_CAPACITY');
  const selected = options.agentIds && new Set(options.agentIds);
  const agents = snapshot.agents.filter(agent => !selected || selected.has(agent.agentId))
    .map(agent => ({ ...agent, source: sourceFor(agent, history) }));
  return { status: 'AVAILABLE', scope, agents, history, evidenceStatus: 'UNVERIFIED' };
}

async function readContext(request = {}) {
  if (!bridge.enabled()) return { status: 'DISABLED', agents: [], history: [], evidenceStatus: 'UNVERIFIED' };
  try { return await readAvailable(request); }
  catch (error) {
    return { status: 'UNAVAILABLE', reason: error.code || error.message,
      agents: [], history: [], evidenceStatus: 'UNVERIFIED' };
  }
}

module.exports = { readContext };
