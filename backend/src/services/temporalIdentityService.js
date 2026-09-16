'use strict';

/**
 * Temporal Identity Service — A-series (passé/présent/futur), B-series (avant/après),
 * identité personnelle, problème du bateau de Thésée.
 *
 * Mapping GenOS :
 *  - A-series  = télémesure d'un agent (événements passés, statut présent, plan futur)
 *  - B-series  = chaîne causale parent → enfant
 *  - Identité  = continuité des agent_memories
 *  - Bateau de Thésée = remplacement progressif des composants (strategy, DN)
 */

async function aseriesForAgent({ db, agentId }) {
  if (!agentId || !db) throw new Error('temporalIdentityService.aseriesForAgent requires agentId and db');
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  if (!agent) throw new Error(`agent ${agentId} not found`);
  const events = await db.all(
    'SELECT * FROM telemetry_events WHERE agent_id = ? ORDER BY created_at ASC LIMIT 100',
    agentId
  );
  return {
    agentId,
    past: events.filter(e => new Date(e.created_at) < new Date(agent.updated_at)),
    present: { id: agent.id, status: agent.status, updatedAt: agent.updated_at },
    future: [],
  };
}

async function bseriesForAgent({ db, agentId }) {
  if (!agentId || !db) throw new Error('temporalIdentityService.bseriesForAgent requires agentId and db');
  const events = await db.all(
    'SELECT * FROM telemetry_events WHERE agent_id = ? ORDER BY created_at ASC',
    agentId
  );
  return {
    agentId,
    timeline: events.map((event, index) => ({
      event,
      before: events.slice(0, index).map(e => e.id),
      after: events.slice(index + 1).map(e => e.id),
    })),
  };
}

async function checkMemoryContinuity({ db, agentId }) {
  if (!agentId || !db) throw new Error('agentId and db required');
  const memories = await db.all(
    'SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY created_at ASC',
    agentId
  );
  const continuous = memories.every((memory, index) => {
    if (index === 0) return true;
    return new Date(memory.created_at) >= new Date(memories[index - 1].created_at);
  });
  return { agentId, continuous, count: memories.length };
}

async function shipOfTheseus({ db, agentId, replacedComponents = [] }) {
  if (!agentId || !db) throw new Error('agentId and db required');
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  if (!agent) throw new Error(`agent ${agentId} not found`);
  const totalComponents = (agent.about?.match(/\b\w+ness\b/g) || []).length || 1;
  return {
    agentId,
    totalComponents,
    replacedComponents: replacedComponents.length,
    identityPreserved: replacedComponents.length < totalComponents / 2,
  };
}

function aSeriesPosition(events) {
  if (!Array.isArray(events) || events.length === 0) return { past: [], present: null, future: [] };
  const sorted = [...events].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return {
    past: sorted.slice(0, -1),
    present: sorted[sorted.length - 1],
    future: [],
  };
}

module.exports = {
  aseriesForAgent,
  bseriesForAgent,
  checkMemoryContinuity,
  shipOfTheseus,
  aSeriesPosition,
};
