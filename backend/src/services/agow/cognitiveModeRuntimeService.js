'use strict';

const policy = require('./cognitiveModePolicyService');
const experience = require('./cognitiveModeExperienceService');
const { randomUUID } = require('node:crypto');

function signalsFor(frame, candidates) {
  return {
    uncertainty: frame.epistemicState.uncertainty,
    evidenceGap: frame.unresolvedQuestions.length ? 1 : frame.epistemicState.contradiction,
    predictionError: frame.causalContext.predictionError,
    irreversibility: Math.max(0, ...candidates.map((item) => Number(item.epistemicContext?.irreversibility) || 0)),
    goalUrgency: Math.max(0, ...candidates.map((item) => Number(item.measures.goalRelevance) || 0)),
    selfTwinUncertainty: frame.selfModel?.uncertainty ?? 1,
    viabilityRisk: frame.interoception?.viabilityRisk ?? 0
  };
}

async function choose(options) {
  const loaded = await experience.load(options);
  const receipts = Array.isArray(loaded.state.receipts) ? loaded.state.receipts : [];
  const experiences = receipts.filter((item) => Number.isFinite(item.predictionError))
    .slice(-200).map((item) => ({ mode: item.chosenMode, predictionError: item.predictionError }));
  return policy.evaluate({ signals: signalsFor(options.frame, options.candidates), experiences });
}

async function execute(options) {
  const { mode } = options.decision;
  if (mode === 'ABSTAIN') return { route: mode, executed: false, reason: 'abstention_gate' };
  if (mode === 'ACT') return finish(options, mode, await broadcast(options));
  if (mode === 'SIMULATE') return finish(options, mode, await options.runShadow());
  if (['OBSERVE', 'VERIFY', 'RECALL'].includes(mode)) return finish(options, mode, await options.runQuery(mode));
  const handler = options.modeExecutors?.[mode];
  if (typeof handler === 'function') return finish(options, mode,
    await handler({ frame: options.frame, candidates: options.candidates, db: options.db }));
  return { route: mode, executed: false, reason: 'mode_executor_unavailable' };
}

async function finish(options, mode, result) {
  const receipt = Number.isFinite(Number(result?.realizedLoss))
    ? await experience.observeOutcome({ agentId: options.agentId, db: options.db,
      receiptId: options.receipt.receiptId, mode, realizedLoss: Number(result.realizedLoss) }) : null;
  return { route: mode, result, outcomeReceipt: receipt };
}

async function broadcast(options) {
  return require('./workspaceBroadcastService').publish({ frame: options.frame, modules: options.receivers,
    recipientAgentIds: options.recipientAgentIds, db: options.db, skipTransport: options.skipTransport });
}

async function record(options) {
  return experience.recordDecision({ agentId: options.agentId, db: options.db, receipt: {
    receiptId: randomUUID(), frameId: options.frame.frameId,
    chosenMode: options.decision.mode, alternatives: options.decision.alternatives,
    predictedLoss: options.decision.expectedLoss, realizedLoss: null, predictionError: null,
    decision: options.decision, createdAt: options.now
  } });
}

module.exports = { signalsFor, choose, execute, record };
