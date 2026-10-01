'use strict';

const registry = require('./workspaceReceiverRegistry');
const adapter = require('./candidates/candidateAdapterService');

function candidateFrom(options) {
  const { frame, query, observation } = options;
  const now = Date.now();
  const epistemicOrigin = adapter.epistemicOrigin(observation.module, {});
  return adapter.build({
    module: observation.module, agentId: frame.agentId, now,
    observation: { ...observation, epistemicOrigin: frame.realityMode === 'counterfactual' ? {
      ...epistemicOrigin, realityMode: 'counterfactual', simulationId: frame.simulationId,
      parentRealityFrameId: frame.parentRealityFrameId
    } : epistemicOrigin,
      semanticType: 'active_query_response', compactPreview: observation.summary,
      evidenceRefs: observation.evidenceRefs, causalParents: [frame.frameId], artifactRef: observation.artifactRefs[0] || null,
      confidence: observation.confidence, evidenceCoverage: observation.evidenceRefs.length ? 1 : 0,
      predictionError: 0, noveltyCount: observation.evidenceRefs.length, actionable: false,
      goalMatched: observation.evidenceRefs.length > 0, causalEvidence: observation.evidenceRefs.length > 0,
      redundancyKey: `query:${frame.frameId}:${query.need.capability}`, estimatedCost: observation.cost || 0.1
    }
  });
}

async function memoryQuery(input) {
  const recall = await require('../autobiographicalMemory/recallService').recallForSituation({
    agentId: input.frame.agentId, goal: input.frame.activeGoal || '', kind: 'active_query'
  }, { topEpisodes: 3, topLessons: 3 }, input.db);
  const evidenceRefs = [...recall.episodes.map((item) => item.id), ...recall.lessons.map((item) => item.id)].filter(Boolean);
  const confidence = recall.lessons[0]?.confidence ?? (recall.episodes.length ? 0.6 : 0.2);
  const candidate = evidenceRefs.length ? candidateFrom({
    frame: input.frame, query: input.query,
    observation: { module: 'memory', summary: recall.summary, evidenceRefs, artifactRefs: evidenceRefs, confidence }
  }) : null;
  return { summary: recall.summary, candidate, outcome: { errorReduction: 0, goalProgress: evidenceRefs.length ? 0.2 : 0, evidenceImprovement: evidenceRefs.length ? 0.6 : 0, cost: 0.1, latencyMs: 0 } };
}

async function selfQuery(input) {
  const self = await require('../coreSelfService').loadCoreSelf(input.db, input.frame.agentId);
  return { summary: `Agency calibration ${Number(self.agencyCalibration || 0).toFixed(2)}; history ${self.lastAttributions?.length || 0}.`, outcome: { evidenceImprovement: 0.2, cost: 0.05, latencyMs: 0 } };
}

async function perceptionQuery(input) {
  const state = await require('./perception/perceptualStateStore').get({ agentId: input.frame.agentId, db: input.db });
  const confidence = Math.max(0, Math.min(1, 1 - Number(input.frame.epistemicState.uncertainty || 0)));
  const evidenceRefs = state.bindings.map((binding) => binding.id);
  const candidate = evidenceRefs.length ? candidateFrom({
    frame: input.frame, query: input.query,
    observation: { module: 'perception', summary: `${state.bindings.length} percept bindings in recurrent state.`, evidenceRefs, artifactRefs: evidenceRefs, confidence }
  }) : null;
  return { summary: `${state.bindings.length} percept bindings; cycle ${state.cycle}.`, candidate, outcome: { errorReduction: 0.1, evidenceImprovement: evidenceRefs.length ? 0.4 : 0, cost: 0.05, latencyMs: 0 } };
}

function ensureRegistered() {
  registry.registerQuery({ module: 'memory', handle: memoryQuery });
  registry.registerQuery({ module: 'autobiographical_memory', handle: memoryQuery });
  registry.registerQuery({ module: 'self_model', handle: selfQuery });
  registry.registerQuery({ module: 'perception', handle: perceptionQuery });
}

module.exports = { ensureRegistered, memoryQuery, selfQuery, perceptionQuery };
