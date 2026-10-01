'use strict';

const poolService = require('./candidatePoolService');
const arbitrationService = require('./workspaceArbitrationService');
const frameService = require('./workspaceFrameService');
const frameStore = require('./workspaceFrameStore');
const ignitionService = require('../ignitionService');
const broadcastService = require('./workspaceBroadcastService');

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
  const candidates = poolService.list({ agentId: options.agentId, now });
  const result = arbitrationService.arbitrate({ candidates, capacity: (options.primaryCapacity || 1) + (options.secondaryCapacity ?? 2), competition: options.competition });
  const ignition = await ignite({ candidates: result.selected, agentId: options.agentId, db: options.db, threshold: options.ignitionThreshold, now });
  const firedIds = new Set(ignition.filter((entry) => entry.ignited).map((entry) => entry.candidateId));
  const ignited = result.selected.filter((candidate) => firedIds.has(candidate.candidateId));
  const frameCandidates = ignited.length ? result.selected : [];
  const previousFrame = frameStore.current({ agentId: options.agentId });
  const frame = frameService.create({ agentId: options.agentId, cycle: (previousFrame?.cycle || 0) + 1, selected: frameCandidates, previousFrame, now, settings: options });
  const stored = frameStore.save({ frame });
  const broadcast = ignited.length ? await broadcastService.publish({ frame, modules: options.receivers, recipientAgentIds: options.recipientAgentIds }) : null;
  return { frame: stored.frame || previousFrame || null, candidateCount: candidates.length, arbitration: result, ignition, broadcast };
}

module.exports = { cycle };
