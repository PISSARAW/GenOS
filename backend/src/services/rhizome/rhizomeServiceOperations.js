'use strict';

function create(input) {
  return {
    depositTrail: (sessionId, marker, options = {}) => {
      const normalizedMarker = String(marker);
      return input.mutateSession(sessionId, options, {
        type: options.isRepellent === true ? 'TRAIL_REPELLED' : 'TRAIL_DEPOSITED',
        payload: { marker: normalizedMarker, amount: Number(options.amount) || 0, isRepellent: options.isRepellent === true, kind: options.kind || 'CAPABILITY_FOUND' },
        apply: (session) => {
          const trail = input.trailService.deposit(session.matrix, normalizedMarker, { ...options, amount: Number(options.amount) || 0, scope: options.scope || session.scope });
          return { sessionId, marker: normalizedMarker, trail, dominant: session.matrix.selectDominantPath() };
        }
      });
    },
    routeDirectMember: async (sessionId, need, options = {}) => {
      const session = await input.getSession(sessionId, options.db);
      return input.directMemberRouter.route({ session, sessionId, need, coherent: options.coherent, now: options.now });
    },
    graphSnapshot: async (sessionId, options = {}) => input.capabilityGraph.snapshot(await input.getSession(sessionId, options.db)),
    projectGraph: async (sessionId, options = {}) => {
      if (!options.db || !options.graphStore) {
        throw Object.assign(new Error('Rhizome graph projection requires SQLite and a graph repository.'), { code: 'RHIZOME_PROJECTION_DEPENDENCIES_REQUIRED' });
      }
      return input.graphProjector.project(options.db, options.graphStore, sessionId);
    },
    graphHealth: async (sessionId, options = {}) => input.graphAnalytics.assess(await input.getSession(sessionId, options.db)),
    inspectPruning: async (sessionId, options = {}) => input.pruningService.inspect(await input.getSession(sessionId, options.db), options),
    applyPruningPlan: (sessionId, plan, options = {}) => input.mutateSession(sessionId, options, {
      type: 'STRUCTURE_PRUNED',
      payload: { expectedGraphVersion: plan?.graphVersion },
      apply: (session) => input.pruningExecutor.apply(session, plan, options)
    }),
    setVariant: (sessionId, name, options = {}) => input.mutateSession(sessionId, options, {
      type: 'VARIANT_SWITCHED',
      payload: { variant: name },
      apply: (session) => {
        const policy = input.variantPolicyService.resolve(name);
        session.variant = policy.name;
        session.variantPolicy = policy;
        return { sessionId, variant: policy.name };
      }
    }),
    getVariantPolicy: async (sessionId, options = {}) => (await input.getSession(sessionId, options.db)).variantPolicy,
    maintainTick: (sessionId, options = {}) => input.mutateSession(sessionId, options, {
      type: 'TICK_HOMEOSTASIS',
      payload: { tickId: options.tickId || null },
      apply: (session) => maintainTick({ ...input, session, options })
    }),
    admitNestedTopology: (sessionId, admission, options = {}) => input.mutateSession(sessionId, options, {
      type: 'SUB_TOPOLOGY_ADMITTED',
      payload: { nodeId: admission.nodeId, targetTopology: admission.morphogenesisPlan?.selectedTopology },
      apply: (session) => input.nestedTopologyService.admit(session, admission, options.admissionPolicy)
    })
  };
}

function maintainTick(input) {
  const { session, options } = input;
  const working = { ...session, nodes: [...session.nodes], edges: [...session.edges] };
  const conductivity = input.conductivityService.step({
    session: working, alpha: options.alpha, beta: options.beta, decay: options.decay
  });
  const pruning = input.pruningService.inspect(working, options);
  const shouldPrune = session.variantPolicy?.pruning?.enabled
    && [...pruning.edgeDispositions, ...pruning.nodeDispositions].some(isRetirement);
  const pruningResult = shouldPrune ? input.pruningExecutor.apply(working, pruning, options) : null;
  session.nodes = working.nodes;
  session.edges = working.edges;
  session.graphVersion = working.graphVersion;
  const evaporation = input.trailService.evaporate(session.matrix, options.now);
  return { graphVersion: session.graphVersion, evaporation, conductivity, pruning: pruningResult };
}

function isRetirement(item) {
  return item.action === 'PRUNE' || item.action === 'FOSSILIZE';
}

module.exports = { create };
