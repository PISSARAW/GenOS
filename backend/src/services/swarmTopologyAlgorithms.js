'use strict';

/**
 * @file swarmTopologyAlgorithms.js
 * @description Implements the swarm organizations that were metadata-only
 * (flocking_boids, fish_school_search, slime_mould_network, grey_wolf_optimizer)
 * so a topology can actually steer its agents instead of only naming a shape.
 */

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function centroid(list) {
  const count = list.length || 1;
  return {
    x: list.reduce((sum, agent) => sum + num(agent.x, 0), 0) / count,
    y: list.reduce((sum, agent) => sum + num(agent.y, 0), 0) / count
  };
}

function distance(a, b) {
  return Math.hypot(num(a.x, 0) - num(b.x, 0), num(a.y, 0) - num(b.y, 0));
}

function flockingBoids(agents, options = {}) {
  const list = Array.isArray(agents) ? agents : [];
  const center = centroid(list);
  const cohesion = num(options.cohesion, 0.05);
  const alignment = num(options.alignment, 0.05);
  const separation = num(options.separation, 0.1);
  const radius = num(options.separationRadius, 1);
  return list.map((agent) => {
    const others = list.filter((other) => other !== agent);
    const avgHeading = others.length ? others.reduce((sum, other) => sum + num(other.heading, 0), 0) / others.length : num(agent.heading, 0);
    let separationX = 0;
    let separationY = 0;
    for (const other of others) {
      const gap = distance(agent, other);
      if (gap > 0 && gap < radius) {
        separationX += (num(agent.x, 0) - num(other.x, 0)) / gap;
        separationY += (num(agent.y, 0) - num(other.y, 0)) / gap;
      }
    }
    return {
      id: agent.id,
      heading: num(agent.heading, 0) + alignment * (avgHeading - num(agent.heading, 0)),
      vector: {
        x: cohesion * (center.x - num(agent.x, 0)) + separation * separationX,
        y: cohesion * (center.y - num(agent.y, 0)) + separation * separationY
      }
    };
  });
}

function fishSchoolSearch(agents, options = {}) {
  const list = Array.isArray(agents) ? agents : [];
  const weighted = (agent) => Math.max(0, num(agent.fitness, 1));
  const totalWeight = list.reduce((sum, agent) => sum + weighted(agent), 0) || 1;
  const barycenter = {
    x: list.reduce((sum, agent) => sum + num(agent.x, 0) * weighted(agent), 0) / totalWeight,
    y: list.reduce((sum, agent) => sum + num(agent.y, 0) * weighted(agent), 0) / totalWeight
  };
  const step = num(options.step, 0.1);
  return {
    barycenter,
    individuals: list.map((agent) => ({
      id: agent.id,
      volitive: { x: step * (barycenter.x - num(agent.x, 0)), y: step * (barycenter.y - num(agent.y, 0)) }
    }))
  };
}

function slimeMouldNetwork(edges, options = {}) {
  const list = Array.isArray(edges) ? edges : [];
  const matrix = options.matrix;
  const reinforcement = num(options.reinforcement, 1.1);
  const decay = num(options.decay, 0.9);
  const pruneBelow = num(options.pruneBelow, 0.05);
  const shared = matrix && typeof matrix.depositTrace === 'function' && typeof matrix.getDecayedIntensity === 'function';
  const result = [];
  for (const edge of list) {
    const flow = Math.max(0, num(edge.flow, 0));
    let conductivity;
    if (shared) {
      const marker = `edge:${edge.id}`;
      if (flow > 0) matrix.depositTrace(marker, flow);
      conductivity = Math.max(0, matrix.getDecayedIntensity(marker));
    } else {
      conductivity = Math.max(0, num(edge.conductivity, 0.5) * (flow > 0 ? reinforcement : decay));
    }
    if (conductivity >= pruneBelow) result.push({ id: edge.id, conductivity: Number(conductivity.toFixed(4)) });
  }
  return result;
}

function greyWolfOptimizer(pack, options = {}) {
  const list = Array.isArray(pack) ? pack : [];
  const ranked = [...list].sort((a, b) => num(b.fitness, 0) - num(a.fitness, 0));
  const leaders = ranked.slice(0, 3);
  const step = num(options.step, 0.1);
  const roles = ['alpha', 'beta', 'delta'];
  return ranked.map((wolf, index) => {
    const target = index < 3 ? leaders[index] : leaders[0];
    return {
      id: wolf.id,
      role: roles[index] || 'omega',
      position: {
        x: num(wolf.x, 0) + step * (num(target.x, 0) - num(wolf.x, 0)),
        y: num(wolf.y, 0) + step * (num(target.y, 0) - num(wolf.y, 0))
      }
    };
  });
}

function magnitude(vector) {
  return vector ? Math.hypot(num(vector.x, 0), num(vector.y, 0)) : 0;
}

const PREFERRED_ORG_FILTERS = Object.freeze({
  grey_wolf_optimizer: (step, limit) => (step.pack || []).filter((wolf) => wolf.role && wolf.role !== 'omega').slice(0, limit).map((wolf) => wolf.id),
  fish_school_search: (step, limit) => [...(step.individuals || [])].sort((a, b) => magnitude(b.volitive) - magnitude(a.volitive)).slice(0, limit).map((entry) => entry.id),
  flocking_boids: (step, limit) => [...(step.agents || [])].sort((a, b) => magnitude(b.vector) - magnitude(a.vector)).slice(0, limit).map((entry) => entry.id),
});

function preferredAgents(organization, step, limit = 3) {
  const org = String(organization || '').trim().toLowerCase();
  if (!step || limit <= 0) return [];
  const fn = PREFERRED_ORG_FILTERS[org];
  return fn ? fn(step, limit) : [];
}

function runTopologyStep(organization, state = {}, options = {}) {
  switch (String(organization || '').trim().toLowerCase()) {
    case 'flocking_boids': return { organization: 'flocking_boids', agents: flockingBoids(state.agents, options) };
    case 'fish_school_search': return { organization: 'fish_school_search', ...fishSchoolSearch(state.agents, options) };
    case 'slime_mould_network': return { organization: 'slime_mould_network', edges: slimeMouldNetwork(state.edges, options) };
    case 'grey_wolf_optimizer': return { organization: 'grey_wolf_optimizer', pack: greyWolfOptimizer(state.pack, options) };
    default: {
      const organizationAlgorithms = require('./organizationAlgorithms');
      return organizationAlgorithms.runOrganizationStep(organization, state, options);
    }
  }
}

module.exports = { flockingBoids, fishSchoolSearch, slimeMouldNetwork, greyWolfOptimizer, runTopologyStep, preferredAgents };
