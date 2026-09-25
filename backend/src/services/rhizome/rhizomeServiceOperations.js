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
    graphHealth: async (sessionId, options = {}) => input.graphAnalytics.assess(await input.getSession(sessionId, options.db))
  };
}

module.exports = { create };
