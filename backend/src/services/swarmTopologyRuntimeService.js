'use strict';

/**
 * @file swarmTopologyRuntimeService.js
 * @description Runtime bridge for swarm organizations. It reads the current
 * organization, builds a state from the orchestrator's active workers and
 * applies the matching swarm algorithm so the topology actually steers agents.
 */
const dynamicOrganization = require('./dynamicOrganizationService');
const swarmTopologyAlgorithms = require('./swarmTopologyAlgorithms');
const telemetry = require('./telemetryObserver');

function charSum(value) {
  let sum = 0;
  for (const character of String(value || '')) sum += character.charCodeAt(0);
  return sum;
}

async function stateFromOrchestrator(db, orchestratorId) {
  const agents = await db.all('SELECT id, role, status FROM agents WHERE parent_agent_id = ?', orchestratorId).catch(() => []);
  const pack = (Array.isArray(agents) ? agents : []).map((agent) => {
    const score = charSum(agent.id);
    return {
      id: agent.id,
      role: agent.role,
      x: score % 100,
      y: score % 71,
      heading: score % 360,
      fitness: agent.status === 'completed' ? 1 : (agent.status === 'running' ? 0.5 : 0)
    };
  });
  const edges = [];
  for (let index = 1; index < pack.length; index += 1) {
    edges.push({ id: `${pack[index - 1].id}->${pack[index].id}`, conductivity: 0.5, flow: pack[index].fitness });
  }
  return { agents: pack, pack, edges };
}

async function applyStepForOrchestrator(orchestratorId, options = {}) {
  const db = options.db || await require('../db').getDatabase();
  const current = await dynamicOrganization.getState(db, orchestratorId).catch(() => null);
  if (!current || !current.organization) return null;
  const state = options.state || await stateFromOrchestrator(db, orchestratorId);
  const step = swarmTopologyAlgorithms.runTopologyStep(current.organization, state, options);
  if (!step) return null;
  telemetry.emitEvent({
    eventType: 'SWARM_TOPOLOGY_STEP',
    agentId: orchestratorId,
    action: 'TOPOLOGY_STEP',
    detail: `Applied '${current.organization}' swarm step to ${state.agents.length} agents.`,
    severity: 'info',
    payload: { organization: current.organization, step }
  });
  return step;
}

module.exports = { stateFromOrchestrator, applyStepForOrchestrator };
