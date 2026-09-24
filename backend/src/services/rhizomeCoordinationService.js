'use strict';

/**
 * @file rhizomeCoordinationService.js
 * @description Rhizome coordination: a decentralized capability mesh directed
 * by stigmergic pheromone trails. Sessions are persisted so workers (separate
 * processes) can deposit trails and read the shared medium.
 */
const biologicalModeService = require('./biologicalModeService');
const topologyCapabilityService = require('./topologyCapabilityService');
const { createSwarmMatrix } = require('./swarmStigmergyVectorService');
const swarmTopologyAlgorithms = require('./swarmTopologyAlgorithms');
const store = require('./topologySessionStore');
const { normalizeRhizomeSession } = require('./rhizome/contracts/rhizomeSession');
const capabilityGraph = require('./rhizome/graph/capabilityGraphService');
const boundaryDetector = require('./rhizome/boundary/boundaryDetector');
const growthPlanner = require('./rhizome/growth/growthPlanner');
const routePlanner = require('./rhizome/routing/routePlanner');
const trailService = require('./rhizome/stigmergy/trailService');
const routeOutcomeService = require('./rhizome/learning/routeOutcomeService');
const conductivityService = require('./rhizome/routing/conductivityService');
const bridgeService = require('./rhizome/bridges/bridgeService');
const ligandService = require('./rhizome/signaling/capabilityLigandService');
const propagationService = require('./rhizome/propagation/proceduralPropagationService');
const locusService = require('./rhizome/coordination/coordinationLocusService');
const routeRepairService = require('./rhizome/resilience/routeRepairService');
const graphAnalytics = require('./rhizome/analytics/graphAnalyticsService');
const pruningService = require('./rhizome/pruning/pruningService');

const DEFAULT_ORGANIZATION = 'mycelial_routing';
const ROLE_CAPABILITIES = Object.freeze({
  rootless_coordinator: ['coordination'],
  capability_offshoot: ['mission_execution', 'specialized_execution'],
  local_bridge: ['integration'],
  boundary_scout: ['observation', 'capability_discovery']
});
const sessions = new Map();

function normalizeMembers(members) {
  const roles = new Set();
  return members.map((member) => {
    const role = String(member?.role || '').trim();
    const capabilities = member?.capabilities || ROLE_CAPABILITIES[role];
    if (!role) {
      throw Object.assign(new Error('Rhizome member requires a non-empty role.'), { code: 'RHIZOME_MEMBER_INVALID' });
    }
    if (roles.has(role)) {
      throw Object.assign(new Error(`Rhizome member role '${role}' is duplicated.`), { code: 'RHIZOME_MEMBER_INVALID' });
    }
    if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some((item) => typeof item !== 'string' || !item.trim())) {
      throw Object.assign(new Error(`Rhizome member '${role}' requires non-empty typed string capabilities.`), { code: 'RHIZOME_MEMBER_INVALID' });
    }
    roles.add(role);
    return { ...member, role, capabilities: [...new Set(capabilities.map((item) => item.trim()))] };
  });
}

function serialize(session) {
  return {
    ...normalizeRhizomeSession(session),
    mission: session.mission,
    organization: session.organization,
    members: session.members,
    trails: [...session.matrix.trails.entries()],
    oscillators: [...session.matrix.oscillators.entries()]
  };
}

function canonicalSession(state, id) {
  return normalizeRhizomeSession({
    rhizomeId: state.rhizomeId || id,
    missionId: state.missionId || id,
    scope: state.scope,
    graphVersion: state.graphVersion,
    nodes: state.nodes,
    edges: state.edges,
    activeNeeds: state.activeNeeds,
    openGaps: state.openGaps,
    coordinationLoci: state.coordinationLoci,
    budgets: state.budgets,
    status: state.status
  });
}

function restoreMatrix(state) {
  const matrix = createSwarmMatrix();
  for (const [marker, entry] of state.trails || []) matrix.trails.set(marker, entry);
  for (const [agentId, entry] of state.oscillators || []) matrix.oscillators.set(agentId, entry);
  return matrix;
}

function rehydrate(record) {
  const state = record.state || {};
  const canonical = canonicalSession(state, record.id);
  const organization = state.organization || DEFAULT_ORGANIZATION;
  return {
    ...canonical,
    sessionId: record.id,
    revision: Number(record.revision) || 0,
    mission: state.mission || '',
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'rhizome', organization }),
    matrix: restoreMatrix(state),
    members: normalizeMembers(Array.isArray(state.members) ? state.members : [])
  };
}

async function composeRhizome(mission, options = {}) {
  const goal = String(mission || '').trim();
  if (!goal) {
    throw Object.assign(new Error('Rhizome mission is required.'), { code: 'RHIZOME_MISSION_REQUIRED' });
  }
  const organization = options.organization || DEFAULT_ORGANIZATION;
  const sessionId = options.rhizomeId || `rhizome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    ...normalizeRhizomeSession({
      rhizomeId: sessionId,
      missionId: options.missionId || sessionId,
      scope: options.scope,
      graphVersion: options.graphVersion,
      nodes: options.nodes,
      edges: options.edges,
      activeNeeds: options.activeNeeds,
      openGaps: options.openGaps,
      coordinationLoci: options.coordinationLoci,
      budgets: options.budgets,
      status: options.status
    }),
    sessionId,
    mission: goal,
    organization,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'rhizome', organization }),
    matrix: createSwarmMatrix(),
    members: normalizeMembers(Array.isArray(options.members) ? options.members : biologicalModeService.compose('rhizome', goal))
  };
  if (options.db) {
    const created = await store.createRhizome(options.db, { id: session.sessionId, state: serialize(session) }, {
      type: 'SESSION_CREATED', payload: { mission: goal, organization }
    });
    session.revision = created.revision;
  }
  sessions.set(session.sessionId, session);
  return session;
}

async function getSession(sessionId, db) {
  if (db) {
    const record = await store.load(db, sessionId);
    if (record && record.topology === 'rhizome') {
      const session = rehydrate(record);
      sessions.set(sessionId, session);
      return session;
    }
  }
  const session = sessions.get(sessionId);
  if (session) return session;
  throw Object.assign(new Error(`Unknown rhizome session '${sessionId}'.`), { code: 'RHIZOME_SESSION_UNKNOWN' });
}

async function depositTrail(sessionId, marker, options = {}) {
  const normalizedMarker = String(marker);
  return mutateSession(sessionId, options, {
    type: options.isRepellent === true ? 'TRAIL_REPELLED' : 'TRAIL_DEPOSITED',
    payload: { marker: normalizedMarker, amount: Number(options.amount) || 0, isRepellent: options.isRepellent === true, kind: options.kind || 'CAPABILITY_FOUND' },
    apply: (session) => {
      const trail = trailService.deposit(session.matrix, normalizedMarker, { ...options, amount: Number(options.amount) || 0, scope: options.scope || session.scope });
      return { sessionId, marker: normalizedMarker, trail, dominant: session.matrix.selectDominantPath() };
    }
  });
}

async function routeDirectMember(sessionId, need, options = {}) {
  const session = await getSession(sessionId, options.db);
  const target = String(need || '').trim();
  if (!target) throw Object.assign(new Error('A non-empty capability need is required.'), { code: 'RHIZOME_NEED_REQUIRED' });
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const alternatives = routeAlternatives(session, target, now);
  return directMemberDecision({ sessionId, target, alternatives, coherent: options.coherent });
}

async function graphSnapshot(sessionId, options = {}) {
  return capabilityGraph.snapshot(await getSession(sessionId, options.db));
}

async function addCapabilityNode(sessionId, node, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'NODE_DISCOVERED',
    payload: { nodeId: node.nodeId },
    apply: (session) => Object.assign(session, capabilityGraph.addNode(session, node))
  });
}

async function addCapabilityEdge(sessionId, edge, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'EDGE_CREATED',
    payload: { edgeId: edge.edgeId, from: edge.from, to: edge.to },
    apply: (session) => Object.assign(session, capabilityGraph.addEdge(session, edge))
  });
}

async function inspectCapabilityNeed(sessionId, need, options = {}) {
  const session = await getSession(sessionId, options.db);
  const outcome = boundaryDetector.inspect(session, need);
  if (!outcome.gap) return outcome;
  return mutateSession(sessionId, options, {
    type: 'GAP_DETECTED',
    payload: { gapId: outcome.gap.gapId, needId: outcome.gap.needId, evidenceId: outcome.gap.evidence.evidenceId },
    apply: (current) => {
      if (!current.activeNeeds.some((item) => item.needId === need.needId)) current.activeNeeds.push(need);
      if (!current.openGaps.some((item) => item.gapId === outcome.gap.gapId)) current.openGaps.push(outcome.gap);
      return outcome;
    }
  });
}

async function planGrowth(sessionId, gapId, options = {}) {
  const session = await getSession(sessionId, options.db);
  const gap = session.openGaps.find((item) => item.gapId === gapId);
  if (!gap) throw Object.assign(new Error(`Unknown Rhizome gap '${gapId}'.`), { code: 'RHIZOME_GAP_UNKNOWN' });
  return growthPlanner.plan({ session, gap, values: options.candidates, options });
}

async function routeToCapability(sessionId, need, options = {}) {
  return routePlanner.plan(await getSession(sessionId, options.db), need);
}

async function evaporateTrails(sessionId, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'TRAILS_EVAPORATED',
    payload: {},
    apply: (session) => ({ sessionId, trails: trailService.evaporate(session.matrix, options.now) })
  });
}

async function recordRouteOutcome(sessionId, receipt, options = {}) {
  const succeeded = receipt?.outcome === 'SUCCESS';
  return mutateSession(sessionId, options, {
    type: succeeded ? 'ROUTE_SUCCEEDED' : 'ROUTE_FAILED',
    payload: { routeId: receipt?.routeId, outcome: receipt?.outcome, verificationId: receipt?.verification?.verificationId },
    apply: (session) => routeOutcomeService.applyOutcome({
      session, receipt, now: options.now, gamma: options.gamma, amount: options.amount,
      trustedVerifierDigests: options.trustedVerifierDigests
    })
  });
}

async function runConductivityStep(sessionId, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'CONDUCTIVITY_UPDATED',
    payload: { alpha: options.alpha, beta: options.beta, decay: options.decay },
    apply: (session) => ({ sessionId, ...conductivityService.step({
      session, alpha: options.alpha, beta: options.beta, decay: options.decay
    }) })
  });
}

async function integrateBridge(sessionId, input, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'BRIDGE_INTEGRATED',
    payload: { bridgeId: input.bridge?.bridgeId, verificationId: input.proof?.signedReceipt?.nonce },
    apply: (session) => Object.assign(session, bridgeService.integrate({
      session, ...input, trustedVerifierDigests: options.trustedVerifierDigests
    }))
  });
}

async function signalCapability(sessionId, ligand, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'CAPABILITY_SIGNAL_PUBLISHED',
    payload: { signalId: ligand.signalId, capability: ligand.capability },
    apply: (session) => ligandService.publish(session, ligand)
  });
}

function propagateProcedure(input) {
  return propagationService.propagate(input);
}

async function manageCoordinationLocus(sessionId, input, options = {}) {
  return mutateSession(sessionId, options, {
    type: `LOCUS_${String(input.action || '').toUpperCase()}`,
    payload: { locusId: input.locus?.locusId || input.locusId || null, action: input.action },
    apply: (session) => locusService.apply({ ...input, session })
  });
}

async function repairRoute(sessionId, input, options = {}) {
  return routeRepairService.repair({
    session: await getSession(sessionId, options.db), need: input.need, receipt: input.receipt,
    trustedVerifierDigests: options.trustedVerifierDigests
  });
}

async function graphHealth(sessionId, options = {}) {
  return graphAnalytics.assess(await getSession(sessionId, options.db));
}

async function inspectPruning(sessionId, options = {}) {
  return pruningService.inspect(await getSession(sessionId, options.db), options);
}

function routeAlternatives(session, target, now) {
  const capable = session.members.filter((member) => member.role === target || (Array.isArray(member.capabilities) && member.capabilities.includes(target)));
  const marker = `route:capability/${target}`;
  return capable.map((member) => {
    const trail = session.matrix.getDecayedIntensity(marker, now);
    const routeMarker = `route:member/${member.role}/${target}`;
    const memberTrail = session.matrix.getDecayedIntensity(routeMarker, now);
    return { role: member.role, score: Number((trail + memberTrail).toFixed(4)), signals: [
      ...(trail ? [{ marker, intensity: trail }] : []),
      ...(memberTrail ? [{ marker: routeMarker, intensity: memberTrail }] : [])
    ] };
  }).sort((left, right) => right.score - left.score || left.role.localeCompare(right.role));
}

function directMemberDecision({ sessionId, target, alternatives, coherent }) {
  if (!alternatives.length) return { sessionId, need: target, memberRole: null, selected: false, verdict: 'no_capable_member', alternatives: [] };
  const best = alternatives[0];
  if (best.score < 0) return { sessionId, need: target, memberRole: null, selected: false, verdict: 'repelled', alternatives };
  if (coherent === false) return { sessionId, need: target, memberRole: null, selected: false, verdict: 'incoherent', alternatives };
  return { sessionId, need: target, memberRole: best.role, selected: true, verdict: 'member_selected', score: best.score, signals: best.signals, alternatives };
}

async function coherence(sessionId, options = {}) {
  const session = await getSession(sessionId, options.db);
  return { sessionId, ...session.matrix.computeKuramotoOrder() };
}

async function runSlimeMouldStep(sessionId, edges, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'PHYSARUM_STEP',
    payload: { edgeCount: Array.isArray(edges) ? edges.length : 0 },
    apply: (session) => ({ sessionId, edges: swarmTopologyAlgorithms.slimeMouldNetwork(edges, { matrix: session.matrix, ...options }) })
  });
}

async function mutateSession(sessionId, options, change) {
  if (!options.db) {
    const session = await getSession(sessionId);
    const result = change.apply(session);
    session.revision += 1;
    return { ...result, revision: session.revision };
  }
  const saved = await store.mutateRhizome(options.db, sessionId, async (record) => {
    const session = rehydrate(record);
    const result = change.apply(session);
    return { state: serialize(session), event: { type: change.type, payload: change.payload }, result };
  });
  return { ...saved };
}

async function closeSession(sessionId, options = {}) {
  if (options.db) await store.closeRhizome(options.db, sessionId);
  sessions.delete(sessionId);
  return true;
}

module.exports = { composeRhizome, depositTrail, routeDirectMember, routeToCapability, graphSnapshot, addCapabilityNode, addCapabilityEdge, inspectCapabilityNeed, planGrowth, evaporateTrails, recordRouteOutcome, runConductivityStep, integrateBridge, signalCapability, propagateProcedure, manageCoordinationLocus, repairRoute, graphHealth, inspectPruning, coherence, runSlimeMouldStep, closeSession, rehydrate };
