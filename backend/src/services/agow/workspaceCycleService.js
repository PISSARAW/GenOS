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
  if (!hasInformationGap(options.frame) || hasQueryResponse(options.candidates)) return null;
  const causal = options.frame.causalContext.predictionError >= 0.5;
  const planned = await queryService.plan({
    frame: options.frame, db: options.db, moduleBudget: 1, maxCost: options.maxCost,
    questionType: causal ? 'causal_discrimination' : undefined,
    capability: causal ? 'causal_discrimination' : 'verification',
    expectedInformationGain: Math.max(options.frame.epistemicState.uncertainty, options.frame.causalContext.predictionError)
  });
  if (!planned.planned) return planned;
  const result = await queryService.execute({ query: planned.query, frame: options.frame, db: options.db });
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
  const result = arbitrationService.arbitrate({ candidates, previousFrame, capacity: (options.primaryCapacity || 1) + (options.secondaryCapacity ?? 2), competition: options.competition });
  const ignition = await ignite({ candidates: result.selected, agentId: options.agentId, db: options.db, threshold: options.ignitionThreshold, now });
  const firedIds = new Set(ignition.filter((entry) => entry.ignited).map((entry) => entry.candidateId));
  const ignited = result.selected.filter((candidate) => firedIds.has(candidate.candidateId));
  if (!ignited.length) return { frame: previousFrame, candidateCount: candidates.length, arbitration: result, ignition, broadcast: null };
  const frame = frameService.create({ agentId: options.agentId, cycle: (previousFrame?.cycle || 0) + 1, selected: result.selected, previousFrame, now, settings: options });
  const stored = await frameStore.save({ frame, db: options.db });
  const broadcast = ignited.length ? await broadcastService.publish({ frame, modules: options.receivers, recipientAgentIds: options.recipientAgentIds, db: options.db }) : null;
  const activeQuery = await runActiveQuery({ frame, candidates: result.selected, db: options.db, maxCost: options.maxQueryCost });
  return { frame: stored.frame || previousFrame || null, candidateCount: candidates.length, arbitration: result, ignition, broadcast, activeQuery };
}

module.exports = { cycle };
