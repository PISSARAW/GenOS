'use strict';

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
const routeQuarantineService = require('./rhizome/security/routeQuarantineService');
const graphProjector = require('./rhizome/graph/rhizomeGraphProjector');
const capabilityAdmission = require('./rhizome/security/capabilityAdmissionService');
const directMemberRouter = require('./rhizome/routing/directMemberRouter');
const variantPolicyService = require('./rhizome/variants/variantPolicyService');
const pruningExecutorService = require('./rhizome/pruning/pruningExecutorService');
const nestedTopologyService = require('./rhizome/nested/nestedTopologyService');
const rhizomeServiceOperations = require('./rhizome/rhizomeServiceOperations');

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
  const canonical = normalizeRhizomeSession(session);
  const { nodes, edges, ...state } = canonical;
  return {
    ...state,
    mission: session.mission,
    organization: session.organization,
    members: session.members,
    variant: session.variant,
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

function rehydrate(record, graph = {}) {
  const state = record.state || {};
  const canonical = canonicalSession({
    ...state,
    nodes: graph.nodes ?? state.nodes,
    edges: graph.edges ?? state.edges,
    graphVersion: graph.graphVersion ?? state.graphVersion
  }, record.id);
  const organization = state.organization || DEFAULT_ORGANIZATION;
  const variant = variantPolicyService.resolve(state.variant);
  return {
    ...canonical,
    sessionId: record.id,
    revision: Number(record.revision) || 0,
    mission: state.mission || '',
    organization,
    variant: variant.name,
    variantPolicy: variant,
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
  const variant = variantPolicyService.resolve(options.variant);
  const sessionId = options.rhizomeId || `rhizome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    ...normalizeRhizomeSession({
      rhizomeId: sessionId,
      missionId: options.missionId || sessionId,
      scope: options.scope || variant.session?.scope,
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
    variant: variant.name,
    variantPolicy: variant,
    capabilityContract: topologyCapabilityService.contractFor({ mode: 'rhizome', organization }),
    matrix: createSwarmMatrix(),
    members: normalizeMembers(Array.isArray(options.members) ? options.members : biologicalModeService.compose('rhizome', goal))
  };
  if (options.db && variant.session?.persistence !== false) {
    const created = await store.createRhizome(options.db, { id: session.sessionId, state: serialize(session), graph: graphProjection(session) }, {
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
      const graph = await store.loadRhizomeGraph(db, sessionId);
      const session = rehydrate(record, graph);
      sessions.set(sessionId, session);
      return session;
    }
  }
  const session = sessions.get(sessionId);
  if (session) return session;
  throw Object.assign(new Error(`Unknown rhizome session '${sessionId}'.`), { code: 'RHIZOME_SESSION_UNKNOWN' });
}

async function mutateSession(sessionId, options, change) {
  if (!options.db) {
    const session = await getSession(sessionId);
    const result = change.apply(session);
    session.revision += 1;
    return { ...result, revision: session.revision };
  }
  const saved = await store.mutateRhizome(options.db, sessionId, async (record) => {
    const graph = await store.loadRhizomeGraph(options.db, sessionId);
    const session = rehydrate(record, graph);
    const result = change.apply(session);
    return { state: serialize(session), graph: graphProjection(session), event: { type: change.type, payload: change.payload }, result };
  });
  return { ...saved };
}

function graphProjection(session) {
  return { nodes: session.nodes, edges: session.edges, graphVersion: session.graphVersion };
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
  return growthPlanner.plan({ session, gap, values: options.candidates, options: { ...options, threshold: options.threshold ?? session.variantPolicy.growth.threshold } });
}

function applyGrowthAdmission(session, input, admissionPolicy) {
  if (!Number.isInteger(input.expectedGraphVersion) || input.expectedGraphVersion !== session.graphVersion) {
    throw Object.assign(new Error('Growth candidate was planned against a stale graph.'), { code: 'RHIZOME_GROWTH_STALE' });
  }
  if (!Array.isArray(input.edges)) {
    throw Object.assign(new Error('Growth edges must be an array.'), { code: 'RHIZOME_GROWTH_INVALID' });
  }
  const discovered = { ...input.node, state: 'DISCOVERED' };
  const active = capabilityAdmission.admit(discovered, input.proof, admissionPolicy);
  let updated = capabilityGraph.addNode({ ...session, nodes: [...session.nodes], edges: [...session.edges] }, discovered);
  for (const edge of input.edges) updated = capabilityGraph.addEdge(updated, edge);
  updated.nodes = updated.nodes.map((node) => node.nodeId === active.nodeId ? active : node);
  updated.graphVersion += 1;
  Object.assign(session, updated);
  return { sessionId: session.sessionId, node: active, graphVersion: session.graphVersion };
}

async function admitGrowthCandidate(sessionId, input, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'GROWTH_ADMITTED',
    payload: { candidateId: input.candidateId, nodeId: input.node?.nodeId },
    apply: (session) => applyGrowthAdmission(session, input, options.admissionPolicy)
  });
}

async function routeToCapability(sessionId, need, options = {}) {
  const session = await getSession(sessionId, options.db);
  return routePlanner.plan(session, need, session.variantPolicy.routing);
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

async function quarantineRoute(sessionId, input, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'EDGE_QUARANTINED',
    payload: { edgeIds: input.edgeIds, evidenceId: input.evidence?.evidenceId, kind: input.evidence?.kind },
    apply: (session) => Object.assign(session, routeQuarantineService.quarantine(session, input, options.trustedVerifierDigests))
  });
}

async function admitCapabilityNode(sessionId, input, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'NODE_ACTIVATED',
    payload: { nodeId: input.nodeId, evidenceId: input.proof?.evidenceId },
    apply: (session) => {
      const index = session.nodes.findIndex((node) => node.nodeId === input.nodeId);
      if (index < 0) throw Object.assign(new Error(`Unknown Rhizome node '${input.nodeId}'.`), { code: 'RHIZOME_NODE_UNKNOWN' });
      session.nodes[index] = capabilityAdmission.admit(session.nodes[index], input.proof, options.admissionPolicy);
      session.graphVersion += 1;
      return { sessionId, node: session.nodes[index], graphVersion: session.graphVersion };
    }
  });
}

async function proposeNestedTopology(sessionId, input, options = {}) {
  return mutateSession(sessionId, options, {
    type: 'SUB_TOPOLOGY_PROPOSED',
    payload: { needKind: input.needKind, topology: input.topology || null },
    apply: (session) => {
      const proposal = nestedTopologyService.propose({
        ...input, missionId: input.missionId || session.missionId,
        mission: input.mission || session.mission, currentTopology: 'rhizome'
      });
      const node = nestedTopologyService.candidateNode(input, proposal);
      Object.assign(session, capabilityGraph.addNode(session, node));
      return { sessionId, ...proposal, candidateNode: node };
    }
  });
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

async function closeSession(sessionId, options = {}) {
  if (options.db) await store.closeRhizome(options.db, sessionId);
  sessions.delete(sessionId);
  return true;
}

const restoredOperations = rhizomeServiceOperations.create({
  mutateSession, getSession, trailService, directMemberRouter, capabilityGraph,
  graphProjector, graphAnalytics, pruningService,
  pruningExecutor: pruningExecutorService, variantPolicyService, nestedTopologyService, conductivityService
});

module.exports = { composeRhizome, ...restoredOperations, routeToCapability, addCapabilityNode, addCapabilityEdge, admitCapabilityNode, proposeNestedTopology, inspectCapabilityNeed, planGrowth, admitGrowthCandidate, evaporateTrails, recordRouteOutcome, runConductivityStep, integrateBridge, signalCapability, propagateProcedure, manageCoordinationLocus, repairRoute, quarantineRoute, coherence, runSlimeMouldStep, closeSession, rehydrate };
