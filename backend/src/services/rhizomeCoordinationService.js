'use strict';

/**
 * @file rhizomeCoordinationService.js
 * @description Rhizome coordination: a decentralized capability mesh directed
 * by stigmergic pheromone trails. Wires the previously unused swarm stigmergy
 * matrix and the capability-mesh organization.
 */
const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const { createSwarmMatrix } = require('./swarmStigmergyVectorService');

const DEFAULT_ORGANIZATION = 'mycelial_routing';
const sessions = new Map();

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw Object.assign(new Error(`Unknown rhizome session '${sessionId}'.`), { code: 'RHIZOME_SESSION_UNKNOWN' });
  return session;
}

function composeRhizome(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Rhizome mission is required.'), { code: 'RHIZOME_MISSION_REQUIRED' });
  }
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const session = {
    sessionId: `rhizome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mission: goal,
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'rhizome', organization }),
    matrix: createSwarmMatrix(),
    members: biologicalModeService.compose('rhizome', goal)
  };
  sessions.set(session.sessionId, session);
  return session;
}

function depositTrail(sessionId, marker, options = {}) {
  const session = getSession(sessionId);
  const trail = session.matrix.depositTrace(String(marker), Number(options.amount) || 0, options.isRepellent === true);
  return { sessionId, marker: String(marker), trail, dominant: session.matrix.selectDominantPath() };
}

function routeToCapability(sessionId, need) {
  const session = getSession(sessionId);
  const target = String(need || '');
  const branch = session.members.find((member) => member.role === target || (member.capabilities || []).includes(target)) || null;
  return { sessionId, need: target, branch: branch ? branch.role : null, routed: Boolean(branch) };
}

function coherence(sessionId) {
  const session = getSession(sessionId);
  return { sessionId, ...session.matrix.computeKuramotoOrder() };
}

function closeSession(sessionId) {
  return sessions.delete(sessionId);
}

module.exports = { composeRhizome, depositTrail, routeToCapability, coherence, closeSession };
