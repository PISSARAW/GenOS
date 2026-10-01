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

const lastPreferred = new Map();

function hashScore(id, role) {
  const input = `${String(id || '')}:${String(role || '')}`;
  let hash = 0;
  for (const character of input) hash = (hash * 31 + character.charCodeAt(0)) % 100000;
  return hash;
}

function fitnessFor(status, sentCount) {
  const base = status === 'completed' ? 1 : (status === 'running' ? 0.5 : 0);
  const bonus = Math.min(0.5, Number(sentCount || 0) * 0.1);
  return Math.min(1.5, base + bonus);
}

function positionFor(id, role) {
  const score = hashScore(id, role);
  return { x: score % 100, y: score % 71, heading: score % 360 };
}

async function messageCounts(db, orchestratorId) {
  const rows = await db.all(
    "SELECT sender_agent_id as id, COUNT(*) as n FROM agent_organization_messages WHERE orchestrator_id = ? AND delivery = 'delivered' GROUP BY sender_agent_id",
    orchestratorId
  ).catch(() => []);
  const counts = new Map();
  for (const row of (rows || [])) counts.set(row.id, Number(row.n || 0));
  return counts;
}

async function stateFromOrchestrator(db, orchestratorId) {
  const agents = await db.all('SELECT id, role, status FROM agents WHERE parent_agent_id = ?', orchestratorId).catch(() => []);
  const counts = await messageCounts(db, orchestratorId);
  const pack = (Array.isArray(agents) ? agents : []).map((agent) => {
    const pos = positionFor(agent.id, agent.role);
    return {
      id: agent.id,
      role: agent.role,
      x: pos.x,
      y: pos.y,
      heading: pos.heading,
      fitness: fitnessFor(agent.status, counts.get(agent.id))
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
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
  const stateFromDb = await stateFromOrchestrator(db, orchestratorId);
  const state = {
    ...stateFromDb,
    ...options.state,
    agents: options.state?.agents || stateFromDb.agents,
    pack: options.state?.pack || stateFromDb.pack,
    edges: options.state?.edges || stateFromDb.edges,
    orchestratorId
  };
  const step = swarmTopologyAlgorithms.runTopologyStep(current.organization, state, options);
  if (!step) return null;
  const preferred = swarmTopologyAlgorithms.preferredAgents(current.organization, step, options.limit);
  lastPreferred.set(orchestratorId, preferred);
  telemetry.emitEvent({
    eventType: 'SWARM_TOPOLOGY_STEP',
    agentId: orchestratorId,
    action: 'TOPOLOGY_STEP',
    detail: `Applied '${current.organization}' organization step to ${state.agents.length} agents.`,
    severity: 'info',
    payload: { organization: current.organization, preferred, step }
  });
  return step;
}

function preferredSurvivorsFor(orchestratorId) {
  return lastPreferred.get(orchestratorId) || [];
}

function samePreferred(first, second) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

async function applyStepsForOrchestrator(orchestratorId, options = {}) {
  const steps = Math.min(5, Math.max(1, Number(options.steps || 3)));
  let last = null;
  let stable = false;
  for (let index = 0; index < steps; index += 1) {
    const before = preferredSurvivorsFor(orchestratorId);
    last = await applyStepForOrchestrator(orchestratorId, options);
    if (last === null) break;
    if (index > 0 && samePreferred(before, preferredSurvivorsFor(orchestratorId))) {
      stable = true;
      break;
    }
  }
  return { step: last, stable };
}

module.exports = { stateFromOrchestrator, applyStepForOrchestrator, applyStepsForOrchestrator, preferredSurvivorsFor };
