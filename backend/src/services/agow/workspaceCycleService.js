'use strict';

const poolService = require('./candidatePoolService');
const arbitrationService = require('./workspaceArbitrationService');
const frameService = require('./workspaceFrameService');
const frameStore = require('./workspaceFrameStore');
const ignitionService = require('../ignitionService');
const broadcastService = require('./workspaceBroadcastService');
const queryService = require('./workspaceQueryService');

function hasInformationGap(frame) {
  return frame.unresolvedQuestions.length > 0 || frame.epistemicState.contradiction > 0
    || frame.epistemicState.uncertainty >= 0.5 || frame.causalContext.predictionError >= 0.5;
}

function hasQueryResponse(candidates) {
  return candidates.some((candidate) => candidate.content.semanticType === 'active_query_response');
}

async function runActiveQuery(options) {
  const capability = options.capability;
  if (hasQueryResponse(options.candidates) || (!hasInformationGap(options.frame) && capability !== 'recall')) return null;
  const causal = options.frame.causalContext.predictionError >= 0.5;
  const planned = await queryService.plan({
    frame: options.frame, db: options.db, moduleBudget: 1, maxCost: options.maxCost,
    questionType: causal ? 'causal_discrimination' : capability === 'recall' ? 'recall' : undefined,
    capability: causal ? 'causal_discrimination' : capability || 'verification',
    expectedInformationGain: Math.max(options.frame.epistemicState.uncertainty, options.frame.causalContext.predictionError)
  });
  if (!planned.planned) return planned;
  const result = await queryService.execute({ query: planned.query, frame: options.frame, db: options.db,
    counterfactualExecutor: options.counterfactualExecutor, handlers: options.queryHandlers, handlerCosts: options.queryCosts });
  return { ...planned, result };
}

function ignitionWeight(candidate) {
  const measures = candidate.measures;
  return Math.min(1, Math.max(measures.urgency, measures.goalRelevance, measures.predictionError));
}

async function ignite(options) {
  const results = [];
  for (const candidate of options.candidates) {
    const receipt = await ignitionService.charge(options.db, options.agentId, {
      weight: ignitionWeight(candidate), threshold: options.threshold, now: options.now
    });
    results.push({ candidateId: candidate.candidateId, ...receipt });
    if (receipt.ignited) break;
  }
  return results;
}

async function cycle(options) {
  const now = Number(options.now) || Date.now();
  const candidates = await poolService.list({ agentId: options.agentId, now, db: options.db });
  const previousFrame = await frameStore.current({ agentId: options.agentId, db: options.db });
  const result = await arbitrateCycle(options, candidates, previousFrame);
  const ignition = await ignite({ candidates: result.selected, agentId: options.agentId, db: options.db, threshold: options.ignitionThreshold, now });
  const firedIds = new Set(ignition.filter((entry) => entry.ignited).map((entry) => entry.candidateId));
  const ignited = result.selected.filter((candidate) => firedIds.has(candidate.candidateId));
  if (!ignited.length) return { frame: previousFrame, candidateCount: candidates.length, arbitration: result, ignition, broadcast: null };
  const frame = frameService.create({ agentId: options.agentId, cycle: (previousFrame?.cycle || 0) + 1, selected: result.selected, previousFrame, now, settings: options });
  const stored = await frameStore.save({ frame, db: options.db });
  const { decision, modeResult, initialModeReceipt } = await runCognitiveMode({ options, frame, result, now });
  const modeReceipt = modeResult?.outcomeReceipt || initialModeReceipt;
  return { frame: stored.frame || previousFrame || null, candidateCount: candidates.length, arbitration: result,
    ignition, modeReceipt, modeResult, broadcast: modeResult?.route === 'ACT' ? modeResult.result : null,
    activeQuery: ['OBSERVE', 'VERIFY', 'RECALL'].includes(decision.mode) ? modeResult.result : null,
    shadow: decision.mode === 'SIMULATE' ? modeResult.result : null };
}

async function runCognitiveMode(inputOptions) {
  const { options, frame, result, now } = inputOptions;
  const runtime = require('./cognitiveModeRuntimeService');
  const input = { ...options, frame, candidates: result.selected, agentId: options.agentId, db: options.db };
  const decision = await runtime.choose(input);
  const receipt = await runtime.record({ ...input, decision, now });
  const modeResult = await runtime.execute({ ...input, decision, receipt, receivers: options.receivers,
    recipientAgentIds: options.recipientAgentIds, skipTransport: options.skipTransport,
    modeExecutors: options.modeExecutors,
    runQuery: (mode) => options.allowActiveQuery === false ? null : runActiveQuery({ frame,
      candidates: result.selected, db: options.db, maxCost: options.maxQueryCost,
      queryHandlers: options.queryHandlers, queryCosts: options.queryCosts,
      counterfactualExecutor: options.counterfactualExecutor, capability: queryCapability(mode) }),
    runShadow: () => options.counterfactual === false ? null : runShadow(options, frame, result) });
  return { decision, modeResult, initialModeReceipt: receipt };
}

function queryCapability(mode) {
  return mode === 'OBSERVE' ? 'perception' : mode === 'RECALL' ? 'recall' : 'verification';
}

async function runShadow(options, frame, result) {
  const policyService = require('./agowMechanismPolicyService');
  const policy = await policyService.load({ agentId: options.agentId, db: options.db });
  if (policy.counterfactual === 'disabled') return { triggered: false, reason: 'mechanism_disabled' };
  return require('./counterfactual/shadowWorkspaceService').runTriggered({
    agentId: options.agentId, db: options.db, frame, candidates: result.selected,
    regretEstimates: result.regretEstimates, arbitration: result, execute: options.counterfactualExecutor,
    maxFrames: options.maxCounterfactualFrames, maxQueries: options.maxCounterfactualQueries,
    maxWorkers: options.maxCounterfactualWorkers, maxCost: options.maxCounterfactualCost,
    environment: options.counterfactualEnvironment,
    publishOutcomes: policyService.publishesCounterfactual(policy.counterfactual)
  });
}

async function arbitrateCycle(options, candidates, previousFrame) {
  const storedPolicy = await require('./agowStatePersistenceService').load({
    scope: 'agow_attention_policy', agentId: options.agentId, db: options.db
  });
  const regretContext = {
    ...(options.regretContext || {}),
    currentInteroception: options.regretContext?.currentInteroception || storedPolicy.state.variables
  };
  const policyService = require('./agowMechanismPolicyService');
  const mechanismPolicy = await policyService.load({ agentId: options.agentId, db: options.db });
  regretContext.controlRegret = policyService.controlsRegret(mechanismPolicy.regret);
  const market = await runMarkets({ options, candidates, regretContext, mode: mechanismPolicy.markets });
  const arbitrationCandidates = market?.apply ? market.regionalWinners : candidates;
  const arbitration = arbitrationService.arbitrate({
    candidates: arbitrationCandidates, previousFrame,
    capacity: (options.primaryCapacity || 1) + (options.secondaryCapacity ?? 2),
    competition: options.competition, regretContext
  });
  return { ...arbitration, market };
}

async function runMarkets(input) {
  if (input.mode === 'disabled') return null;
  const topology = await require('./markets/morphogenesisMarketAdapter').topologyForCycle({
    agentId: input.options.agentId, db: input.options.db,
    explicitTopology: input.options.marketTopology
  });
  const market = await require('./markets/cognitiveMarketService').compete({
    agentId: input.options.agentId, db: input.options.db, candidates: input.candidates,
    topology, regretContext: input.regretContext,
    capacity: input.options.regionalCapacity || 1, competition: input.options.competition
  });
  if (!market.applied) return market;
  market.apply = ['advisory', 'bounded', 'live'].includes(input.mode);
  return market;
}

module.exports = { cycle };
