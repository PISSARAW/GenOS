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

async function counterfactualQuery(input) {
  const selectedIds = [input.frame.primaryContent, ...input.frame.secondaryContents].filter(Boolean);
  const pool = await require('./candidatePoolService').list({ agentId: input.frame.agentId, db: input.db, now: Date.now() });
  const candidates = pool.filter((candidate) => selectedIds.includes(candidate.candidateId));
  const mechanismPolicy = require('./agowMechanismPolicyService');
  const policy = await mechanismPolicy.load({ agentId: input.frame.agentId, db: input.db });
  const result = await require('./counterfactual/shadowWorkspaceService').runTriggered({
    agentId: input.frame.agentId, db: input.db, frame: input.frame, candidates,
    explicitCausalDiscrimination: true, execute: input.counterfactualExecutor,
    maxQueries: 0, maxFrames: 3, maxWorkers: 2, maxCost: input.query.budget.maxCost,
    publishOutcomes: mechanismPolicy.publishesCounterfactual(policy.counterfactual)
  });
  const receipt = result.simulations?.[0];
  if (!receipt) return { summary: `Prospective simulation: ${result.reason || 'no branch result'}.` };
  const refs = [receipt.receiptId];
  const candidate = adapter.build({ module: 'epistemic', agentId: input.frame.agentId, now: Date.now(), observation: {
    candidateId: `prospective:${input.query.queryId}`, semanticType: 'counterfactual_outcome',
    compactPreview: `Branch ${receipt.branch.branchId}: ${receipt.outcome.success ? 'success' : 'failure'} (uncertainty ${receipt.outcome.uncertainty.toFixed(2)}).`, evidenceRefs: refs,
    causalParents: [input.frame.frameId], confidence: 1 - receipt.outcome.uncertainty,
    evidenceCoverage: refs.length ? 1 : 0, goalMatched: true, causalEvidence: refs.length > 0,
    epistemicOrigin: { origin: 'counterfactual_simulated', realityMode: 'counterfactual', agency: 'environment',
      simulationId: receipt.simulationId, parentRealityFrameId: input.frame.frameId }
  } });
  return { summary: `Simulated ${result.simulations.length} counterfactual branches; this candidate cites branch ${receipt.branch.branchId}.`, candidate,
    outcome: { evidenceImprovement: 0.5, cost: receipt.outcome.cost, latencyMs: 0 } };
}

function ensureRegistered() {
  registry.registerQuery({ module: 'memory', handle: memoryQuery, default: true, estimatedCost: 0.1 });
  registry.registerQuery({ module: 'autobiographical_memory', handle: memoryQuery, default: true, estimatedCost: 0.1 });
  registry.registerQuery({ module: 'self_model', handle: selfQuery, default: true, estimatedCost: 0.05 });
  registry.registerQuery({ module: 'metacognition', handle: selfQuery, default: true, estimatedCost: 0.05 });
  registry.registerQuery({ module: 'perception', handle: perceptionQuery, default: true, estimatedCost: 0.05 });
  registry.registerQuery({ module: 'predictive_hierarchy', handle: perceptionQuery, default: true, estimatedCost: 0.05 });
  registry.registerQuery({ module: 'counterfactual', handle: counterfactualQuery, default: true,
    estimatedCost: (query) => query.budget.maxCost });
  registry.registerQuery({ module: 'verifier', handle: structuralQuery, default: true, estimatedCost: 0 });
  registry.registerQuery({ module: 'world_model', handle: worldQuery, default: true, estimatedCost: 0.05 });
}

async function structuralQuery(input) {
  const pool = await require('./candidatePoolService').list({ agentId: input.frame.agentId, db: input.db });
  const valid = pool.filter(require('./candidateValidationService').validCandidate).length;
  return { summary: `${valid}/${pool.length} structurally valid candidates; semantic verification not established.`,
    validation: { kind: 'structural_only', semanticVerified: false }, outcome: { cost: 0, evidenceImprovement: 0 } };
}

async function worldQuery(input) {
  const loaded = await require('./agowStatePersistenceService').load({ scope: 'world_model', agentId: input.frame.agentId, db: input.db });
  const transitions = loaded.state.transitions || [];
  const refs = transitions.filter((item) => item.status !== 'pending').map((item) => item.id);
  const candidate = refs.length ? candidateFrom({ frame: input.frame, query: input.query,
    observation: { module: 'world_model', summary: `${refs.length} observed world transitions.`,
      evidenceRefs: refs, artifactRefs: refs, confidence: 0.5 } }) : null;
  return { summary: `${transitions.length} world transitions; ${refs.length} resolved.`, candidate,
    outcome: { cost: 0.05, evidenceImprovement: refs.length ? 0.2 : 0 } };
}

module.exports = { ensureRegistered, memoryQuery, selfQuery, perceptionQuery, counterfactualQuery, structuralQuery, worldQuery };
