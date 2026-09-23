'use strict';

/**
 * @file causalLoopService.js
 * @description Closes the post-action learning pipeline:
 *   ActionReceipt → Evidence → Epistemic revision → Outcome → RPE →
 *   Memory consolidation → Strategy performance → Recipe performance →
 *   Morphology experience → LoopReceipt.
 *
 * Learning is causal, not just "mission success" — every action produces
 * evidence that updates beliefs, memory, and future strategy selection.
 */

const epistemicStateService = require('../epistemics/epistemicStateService');
const consolidationPolicyService = require('../memory/consolidationPolicyService');
const morphologyLearningService = require('./morphologyLearningService');
const regulatoryBridge = require('../regulation/regulatoryBridgeService');

const PROVENANCE_SOURCE = 'causalLoopService';
const loopHistory = [];
const MAX_HISTORY = 1000;

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

function recordEvidence(agentId, evidence) {
  const result = epistemicStateService.updateState(agentId, evidence);
  return { recorded: Boolean(result.updated), claimId: result.claimId || null };
}

function computeOutcome(receipt) {
  const expected = receipt.expectedOutcome || {};
  const actual = receipt.outcome || {};
  const success = actual.success !== undefined ? Boolean(actual.success) : (actual.status === 'completed');
  const quality = Number(actual.quality) || 0.5;
  const expectedSuccess = expected.success !== undefined ? Boolean(expected.success) : true;
  const expectedQuality = Number(expected.quality) || 0.5;
  return {
    success,
    quality: Number(quality.toFixed(4)),
    expectedSuccess,
    expectedQuality: Number(expectedQuality.toFixed(4)),
    delta: success === expectedSuccess ? 0 : (success ? 1 : -1),
    qualityDelta: Number((quality - expectedQuality).toFixed(4)),
  };
}

function computeRPE(outcome, receipt) {
  const predicted = Number(receipt.predictedReward) || Number(receipt.expectedOutcome && receipt.expectedOutcome.quality) || 0.5;
  const actual = outcome.quality;
  const rpe = actual - predicted;
  return {
    value: Number(rpe.toFixed(4)),
    predicted: Number(predicted.toFixed(4)),
    actual: Number(actual.toFixed(4)),
    surprise: Number(Math.abs(rpe).toFixed(4)),
  };
}

function consolidateMemory(outcome) {
  const episode = {
    actionType: outcome.actionType || 'unknown',
    actionInput: outcome.actionInput || '',
    observationOutput: outcome.observationOutput || '',
    rewardScore: outcome.quality,
    title: outcome.title || '',
    trajectory: outcome.trajectory || [],
  };
  const classification = consolidationPolicyService.classifyForConsolidation(episode, [episode]);
  return {
    consolidated: classification.action !== 'skip',
    action: classification.action,
    reason: classification.reason || null,
    entry: classification.entry || null,
  };
}

function updateStrategyPerformance(outcome, rpe) {
  return {
    strategyId: outcome.strategyId || 'default',
    success: outcome.success,
    quality: outcome.quality,
    rpe: rpe.value,
    timestamp: new Date().toISOString(),
  };
}

function updateRecipePerformance(outcome, rpe) {
  return {
    recipeId: outcome.recipeId || outcome.cognitiveRecipe || 'default',
    success: outcome.success,
    quality: outcome.quality,
    rpe: rpe.value,
    timestamp: new Date().toISOString(),
  };
}

function recordMorphologyExperience(ctx) {
  const exp = morphologyLearningService.recordExperience({
    problemFeatures: ctx.problemFeatures || {},
    outcome: ctx.outcome || {},
    morphology: ctx.morphology || {},
    evidenceQuality: ctx.evidenceQuality || 0.5,
    tokenCost: ctx.tokenCost || 0,
    latency: ctx.latency || 0,
  });
  return { recorded: exp !== null, experienceId: exp ? exp.morphologyKey : null };
}

function buildNextActionHints(outcome, rpe) {
  const hints = [];
  if (rpe.value > 0.2) hints.push('positive_surprise_reinforce');
  if (rpe.value < -0.2) hints.push('negative_surprise_reconsider');
  if (outcome.quality < 0.3) hints.push('low_quality_retry');
  if (outcome.quality > 0.8) hints.push('high_quality_replicate');
  return hints;
}

function applyRegulatoryFeedback(agentId, rpe) {
  try {
    return regulatoryBridge.applyRpe(agentId, rpe);
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// History management
// ---------------------------------------------------------------------------

function logLoopReceipt(receipt) {
  loopHistory.push(receipt);
  if (loopHistory.length > MAX_HISTORY) loopHistory.shift();
  return receipt;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function morphologyInputOf(actionReceipt, expressionContext) {
  const expression = expressionContext || {};
  const outcome = actionReceipt.outcome || {};
  return {
    problemFeatures: expression.problemFeatures || {},
    outcome,
    morphology: expression.morphology || {},
    evidenceQuality: outcome.quality || 0.5,
    tokenCost: actionReceipt.tokenCost || 0,
    latency: actionReceipt.latency || 0
  };
}

function receiptIdOf(actionReceipt) {
  if (actionReceipt.actionId) return actionReceipt.actionId;
  if (actionReceipt.id) return actionReceipt.id;
  return `action_${Date.now()}`;
}

function regulationViewOf(regulation) {
  if (!regulation) return null;
  return { revision: regulation.revision };
}

function processActionReceipt(ctx) {
  const { actionReceipt, agentId, expressionContext } = ctx || {};
  if (!actionReceipt || !agentId) {
    return { error: 'invalid_context', receipt: null };
  }

  const evidence = actionReceipt.evidence || actionReceipt;
  const outcome = computeOutcome(actionReceipt);
  const rpe = computeRPE(outcome, actionReceipt);
  const evidenceResult = recordEvidence(agentId, evidence);
  const memoryResult = consolidateMemory(outcome);
  const strategyPerf = updateStrategyPerformance(outcome, rpe);
  const recipePerf = updateRecipePerformance(outcome, rpe);
  const morphologyResult = recordMorphologyExperience(morphologyInputOf(actionReceipt, expressionContext));
  const hints = buildNextActionHints(outcome, rpe);
  const regulation = applyRegulatoryFeedback(agentId, rpe);

  const receipt = {
    actionId: receiptIdOf(actionReceipt),
    timestamp: new Date().toISOString(),
    agentId,
    evidenceRecorded: evidenceResult,
    outcome,
    rpe,
    regulation: regulationViewOf(regulation),
    memoryConsolidated: memoryResult,
    strategyPerformance: strategyPerf,
    recipePerformance: recipePerf,
    morphologyExperience: morphologyResult,
    nextActionHints: hints,
  };

  return logLoopReceipt(receipt);
}

function getLoopHistory(agentId) {
  if (!agentId) return [...loopHistory].reverse();
  return loopHistory.filter((r) => r.agentId === agentId).reverse();
}

function getLoopStats(agentId) {
  const history = getLoopHistory(agentId);
  const actions = history.length;
  const successfulActions = history.filter((r) => r.outcome && r.outcome.success).length;
  const rpeValues = history.map((r) => (r.rpe ? r.rpe.value : 0));
  const avgRPE = rpeValues.length > 0
    ? Number((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(4))
    : 0;
  const memoryConsolidations = history.filter((r) => r.memoryConsolidated && r.memoryConsolidated.consolidated).length;
  const strategyChanges = history.filter((r) => r.strategyPerformance && r.strategyPerformance.rpe < -0.2).length;
  const cognitiveMutations = history.filter((r) => r.recipePerformance && r.recipePerformance.rpe < -0.2).length;
  return { actions, successfulActions, avgRPE, memoryConsolidations, strategyChanges, cognitiveMutations };
}

module.exports = {
  processActionReceipt,
  getLoopHistory,
  getLoopStats,
};
