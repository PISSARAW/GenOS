'use strict';

function create(input) {
  return Object.assign({}, ...[
    trails(input), routing(input), graphOperations(input), policies(input),
    nestedTopology(input), routeLearning(input), leases(input), shortcuts(input),
    repairs(input), sessionLifecycle(input)
  ]);
}

function trails(input) {
  return { depositTrail: (sessionId, marker, options = {}) => input.mutateSession(sessionId, options, {
    type: options.isRepellent === true ? 'TRAIL_REPELLED' : 'TRAIL_DEPOSITED',
    payload: { marker: String(marker), amount: Number(options.amount) || 0, isRepellent: options.isRepellent === true, kind: options.kind || 'CAPABILITY_FOUND' },
    apply: (session) => {
      const trail = input.trailService.deposit(session.matrix, String(marker), { ...options, amount: Number(options.amount) || 0, scope: options.scope || session.scope });
      return { sessionId, marker: String(marker), trail, dominant: session.matrix.selectDominantPath() };
    }
  }) };
}

function routing(input) {
  return { routeDirectMember: async (sessionId, need, options = {}) => {
    const session = await input.getSession(sessionId, options.db);
    return input.directMemberRouter.route({ session, sessionId, need, coherent: options.coherent, now: options.now });
  } };
}

function graphOperations(input) {
  return {
    graphSnapshot: async (sessionId, options = {}) => input.capabilityGraph.snapshot(await input.getSession(sessionId, options.db)),
    projectGraph: async (sessionId, options = {}) => {
      if (!options.db || !options.graphStore) throw Object.assign(new Error('Rhizome graph projection requires SQLite and a graph repository.'), { code: 'RHIZOME_PROJECTION_DEPENDENCIES_REQUIRED' });
      return input.graphProjector.project(options.db, options.graphStore, sessionId);
    },
    graphHealth: async (sessionId, options = {}) => input.graphAnalytics.assess(await input.getSession(sessionId, options.db)),
    inspectPruning: async (sessionId, options = {}) => input.pruningService.inspect(await input.getSession(sessionId, options.db), options),
    applyPruningPlan: (sessionId, plan, options = {}) => input.mutateSession(sessionId, options, {
      type: 'STRUCTURE_PRUNED', payload: { expectedGraphVersion: plan?.graphVersion },
      apply: (session) => input.pruningExecutor.apply(session, plan, options)
    })
  };
}

function policies(input) {
  return {
    setVariant: (sessionId, name, options = {}) => input.mutateSession(sessionId, options, {
      type: 'VARIANT_SWITCHED', payload: { variant: name },
      apply: (session) => switchVariant(session, name, input.variantPolicyService)
    }),
    getVariantPolicy: async (sessionId, options = {}) => (await input.getSession(sessionId, options.db)).variantPolicy,
    maintainTick: (sessionId, options = {}) => input.mutateSession(sessionId, options, {
      type: 'TICK_HOMEOSTASIS', payload: { tickId: options.tickId || null },
      apply: (session) => maintainTick({ ...input, session, options })
    })
  };
}

function switchVariant(session, name, service) {
  const policy = service.resolve(name);
  session.variant = policy.name;
  session.variantPolicy = policy;
  return { sessionId: session.sessionId, variant: policy.name };
}

function nestedTopology(input) {
  return { admitNestedTopology: (sessionId, admission, options = {}) => input.mutateSession(sessionId, options, {
    type: 'SUB_TOPOLOGY_ADMITTED', payload: { nodeId: admission.nodeId, targetTopology: admission.morphogenesisPlan?.selectedTopology },
    apply: (session) => input.nestedTopologyService.admit(session, admission, options.admissionPolicy)
  }) };
}

function routeLearning(input) {
  return { recordRouteOutcome: (sessionId, receipt, options = {}) => input.mutateSession(sessionId, options, {
    type: 'ROUTE_OUTCOME_RECORDED', payload: { resultId: receipt?.resultId || null, status: receipt?.status || null },
    apply: (session) => {
      const outcome = input.routeOutcomeService.applyOutcome({ session, receipt, ...options });
      recordLineage(session, { ...outcome, edgeIds: receipt?.edgeIds || [], status: outcome.outcome });
      return outcome;
    }
  }) };
}

function leases(input) {
  return { manageBranchLease: (sessionId, request, options = {}) => input.mutateSession(sessionId, options, {
    type: `BRANCH_LEASE_${String(request.action || '').toUpperCase()}`,
    payload: { branchId: request.branchId, leaseId: request.leaseId || null, action: request.action },
    apply: (session) => applyLease({ service: input.branchLeaseService, session, request, options })
  }) };
}

function applyLease(input) {
  const { service, session, request, options } = input;
  if (request.action === 'release') return service.release(session, request);
  if (request.action === 'acquire' || request.action === 'renew') return service.acquire(session, { ...request, now: options.now ?? request.now });
  throw Object.assign(new Error('Branch lease action must be acquire, renew or release.'), { code: 'RHIZOME_LEASE_ACTION_INVALID' });
}

function shortcuts(input) {
  return {
    planSmallWorldShortcuts: async (sessionId, options = {}) => input.smallWorldTopologyService.plan(await input.getSession(sessionId, options.db), options.maximum),
    admitSmallWorldShortcut: (sessionId, admission, options = {}) => input.mutateSession(sessionId, options, {
      type: 'SMALL_WORLD_SHORTCUT_ADMITTED', payload: { edgeId: admission.candidate?.candidateId, evidenceId: admission.proof?.evidenceId },
      apply: (session) => input.smallWorldTopologyService.admit({ session, candidate: admission.candidate, proof: admission.proof, trustedVerifierDigests: options.trustedVerifierDigests })
    })
  };
}

function repairs(input) {
  return { repairRoute: (sessionId, request, options = {}) => input.mutateSession(sessionId, options, {
    type: 'ROUTE_REPAIRED', payload: { need: request.need, receiptId: request.receipt?.resultId },
    apply: (session) => recordRepairScar(session, input.routeRepairService.repair({ session, ...request, ...options }), options.now)
  }) };
}

function recordRepairScar(session, result, now) {
  if (!result.repaired) return result;
  const scar = { repairId: result.route?.routeId || `repair:${session.graphVersion}`, failedEdgeIds: result.excludedEdgeIds, route: result.route, graphVersion: session.graphVersion, recordedAt: now || new Date().toISOString() };
  session.repairScars = [...(session.repairScars || []), scar].slice(-500);
  return result;
}

function sessionLifecycle(input) {
  return {
    closeSession: async (sessionId, options = {}) => {
      const session = await input.getSession(sessionId, options.db).catch(() => null);
      const fossil = session?.variant === 'ephemeral' ? sessionFossil(session) : null;
      if (options.db) await input.store.closeRhizome(options.db, sessionId, fossil);
      else if (fossil) input.closedSessionFossils.set(sessionId, fossil);
      input.sessions.delete(sessionId);
      return true;
    },
    getSessionFossil: async (sessionId, options = {}) => options.db
      ? input.store.loadRhizomeFossil(options.db, sessionId)
      : input.closedSessionFossils.get(sessionId) || null
  };
}

function recordLineage(session, outcome) {
  if (!outcome.edgeIds?.length) return;
  session.routeLineage = [...(session.routeLineage || []), { edgeIds: outcome.edgeIds, routeId: outcome.routeId, outcome: outcome.outcome, evidenceRefs: outcome.evidenceRefs || [], recordedAt: new Date().toISOString() }].slice(-1000);
}

function sessionFossil(session) {
  return {
    contract: 'RhizomeEphemeralFossil/v1', sessionId: session.sessionId,
    closedAt: new Date().toISOString(), graphVersion: session.graphVersion,
    nodeCount: session.nodes.length, edgeCount: session.edges.length,
    capabilityCount: new Set(session.nodes.flatMap((node) => node.capabilities)).size,
    trailCount: session.matrix.trails.size,
    verifiedEdges: session.edges.filter((edge) => edge.trailState.verifiedFlow > 0).length
  };
}

function maintainTick(input) {
  const { session, options } = input;
  const leases = input.branchLeaseService.expire(session, options.now);
  const working = { ...session, nodes: [...session.nodes], edges: [...session.edges] };
  const conductivity = input.conductivityService.step({ session: working, variantPolicy: session.variantPolicy });
  const pruningOptions = { ...options, ...(session.variantPolicy?.pruning || {}) };
  const pruning = input.pruningService.inspect(working, pruningOptions);
  const shouldPrune = session.variantPolicy?.pruning?.enabled && [...pruning.edgeDispositions, ...pruning.nodeDispositions].some(isRetirement);
  const pruningResult = shouldPrune ? input.pruningExecutor.apply(working, pruning, pruningOptions) : null;
  session.nodes = working.nodes;
  session.edges = working.edges;
  session.graphVersion = working.graphVersion;
  const evaporation = input.trailService.evaporate(session.matrix, options.now);
  return { graphVersion: session.graphVersion, evaporation, conductivity, pruning: pruningResult, leases };
}

function isRetirement(item) {
  return item.action === 'PRUNE' || item.action === 'FOSSILIZE';
}

module.exports = { create };
