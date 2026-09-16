'use strict';

/**
 * Process Philosophy Service — Whitehead, Deleuze, Heidegger.
 *
 * Mapping GenOS :
 *  - Whitehead       = actual occasions (telemetry_events)
 *  - Deleuze         = différence et répétition, rhizome
 *  - Heidegger       = Dasein (être-au-monde), thrownness, projection
 */

function actualOccasion({ agentId, event }) {
  if (!agentId || !event) {
    throw new Error('processPhilosophyService.actualOccasion requires agentId and event');
  }
  return {
    agentId,
    event,
    actuality: event.outcome || 'pending',
    potentiality: event.possibleOutcomes || [],
    prehension: event.inputs || [],
   timestamp: Date.now(),
  };
}

function differenceAndRepetition(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { repetition: 0, difference: 0, intensity: 0 };
  }
  const unique = new Set(events.map(e => JSON.stringify(e)));
  return {
    repetition: events.length,
    difference: unique.size,
    intensity: events.length / unique.size,
  };
}

function dasein({ agentId, thrownness = 'genos_backend', projection = 'mission' }) {
  if (!agentId) throw new Error('processPhilosophyService.dasein requires agentId');
  return {
    agentId,
    beingInTheWorld: true,
    thrownness,
    projection,
    fallen: 'idle',
    timestamp: Date.now(),
  };
}

function rhizome(agents) {
  if (!Array.isArray(agents)) {
    throw new Error('processPhilosophyService.rhizome requires an array of agents');
  }
  return {
    connections: agents.map(a => ({
      id: a.id,
      connections: a.parent_agent_id ? [a.parent_agent_id] : [],
      multiplicity: a.workers?.length || 0,
    })),
    acentered: true,
    heterogeneous: true,
  };
}

module.exports = {
  actualOccasion,
  differenceAndRepetition,
  dasein,
  rhizome,
};
