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
const outcomeEvidenceValidation = require('./learning/outcomeEvidenceValidation');
const regulatoryBridge = require('../regulation/regulatoryBridgeService');
const crypto = require('node:crypto');

const PROVENANCE_SOURCE = 'causalLoopService';
const loopHistory = [];
const MAX_HISTORY = 1000;
const idempotentReceipts = new Map();

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

function recordEvidence(agentId, evidence) {
  const result = epistemicStateService.updateState(agentId, evidence);
  return { recorded: Boolean(result.updated), claimId: result.claimId || null };
}

function verifiedOutcome(input) {
  const { qualityEvidence, expectedSuccess, expectedQuality, binding } = input;
  const verified = outcomeEvidenceValidation.validate(qualityEvidence, binding);
  const success = verified ? qualityEvidence.success : null;
  const quality = verified ? Number(qualityEvidence.value) : null;
  return {
    success,
    qualityVerified: verified,
    quality: quality === null ? null : Number(quality.toFixed(4)),
    evidenceRef: verified ? qualityEvidence.receiptId : null,
    delta: success === null ? null : (success === expectedSuccess ? 0 : (success ? 1 : -1)),
    qualityDelta: quality === null ? null : Number((quality - expectedQuality).toFixed(4)),
  };
}

function declaredOutcome(actual) {
  return {
    declaredSuccess: actual.success !== undefined ? Boolean(actual.success) : actual.status === 'completed',
    declaredQuality: Number.isFinite(Number(actual.quality)) ? Number(actual.quality) : null,
  };
}

function computeOutcome(input) {
  const { receipt, agentId, organizationId, projectId } = input;
  const expected = receipt.expectedOutcome || {};
  const actual = receipt.outcome || {};
  const expectedSuccess = expected.success !== undefined ? Boolean(expected.success) : true;
  const expectedQuality = Number(expected.quality) || 0.5;
  return {
    ...verifiedOutcome({ qualityEvidence: receipt.qualityEvidence, expectedSuccess, expectedQuality,
      binding: { actionId: actionIdOf(receipt), agentId, organizationId, projectId } }),
    ...declaredOutcome(actual),
    expectedSuccess,
    expectedQuality: Number(expectedQuality.toFixed(4)),
  };
}

function computeRPE(outcome, receipt) {
  const predicted = Number(receipt.predictedReward) || Number(receipt.expectedOutcome && receipt.expectedOutcome.quality) || 0.5;
  if (!outcome.qualityVerified) return { value: 0, predicted: Number(predicted.toFixed(4)), actual: null, surprise: 0, eligible: false };
  const actual = outcome.quality;
  const rpe = actual - predicted;
  return {
    value: Number(rpe.toFixed(4)),
    predicted: Number(predicted.toFixed(4)),
    actual: Number(actual.toFixed(4)),
    surprise: Number(Math.abs(rpe).toFixed(4)),
  };
}

function actionIdOf(actionReceipt) {
  return actionReceipt.actionId || actionReceipt.id || null;
}

function counterexamplesOf(actionReceipt) {
  return Array.isArray(actionReceipt.counterexampleRefs) ? actionReceipt.counterexampleRefs : [];
}

function consolidationEpisode(outcome, actionReceipt) {
  return {
    id: actionIdOf(actionReceipt),
    actionType: actionReceipt.actionType || 'unknown',
    actionInput: actionReceipt.actionInput || '',
    observationOutput: actionReceipt.observationOutput || actionReceipt.outcome?.summary || '',
    rewardScore: outcome.quality,
    title: actionReceipt.title || '',
    trajectory: actionReceipt.trajectory || [],
    applicability: actionReceipt.applicability || null,
    evidenceRefs: outcome.evidenceRef ? [outcome.evidenceRef] : [],
    counterexampleRefs: counterexamplesOf(actionReceipt),
  };
}

function consolidateMemory(outcome, actionReceipt) {
  if (!outcome.qualityVerified) return { consolidated: false, action: 'skip', reason: 'verified_outcome_required', entry: null };
  const episode = consolidationEpisode(outcome, actionReceipt);
  const classification = consolidationPolicyService.classifyForConsolidation(episode, [episode]);
  return {
    consolidated: classification.action !== 'skip',
    action: classification.action,
    reason: classification.reason || null,
    entry: classification.entry || null,
  };
}

function updateStrategyPerformance(outcome, rpe) {
  if (!outcome.qualityVerified) return { recorded: false, reason: 'verified_outcome_required' };
  return {
    strategyId: outcome.strategyId || 'default',
    success: outcome.success,
    quality: outcome.quality,
    rpe: rpe.value,
    timestamp: new Date().toISOString(),
  };
}

function updateRecipePerformance(outcome, rpe) {
  if (!outcome.qualityVerified) return { recorded: false, reason: 'verified_outcome_required' };
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
    outcomeEvidence: ctx.outcomeEvidence || null,
    morphology: ctx.morphology || {},
    evidenceQuality: ctx.evidenceQuality ?? 0,
    tokenCost: ctx.tokenCost || 0,
    latency: ctx.latency || 0,
  });
  return {
    recorded: exp !== null,
    experienceId: exp ? exp.morphologyKey : null,
    reason: exp ? null : 'admissible_verified_outcome_evidence_required'
  };
}

function buildNextActionHints(outcome, rpe) {
  const hints = [];
  if (!outcome.qualityVerified) return hints;
  if (rpe.value > 0.2) hints.push('positive_surprise_reinforce');
  if (rpe.value < -0.2) hints.push('negative_surprise_reconsider');
  if (outcome.quality < 0.3) hints.push('low_quality_retry');
  if (outcome.quality > 0.8) hints.push('high_quality_replicate');
  return hints;
}

function applyRegulatoryFeedback(agentId, rpe) {
  if (!rpe.eligible && rpe.eligible !== undefined) return null;
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
  const expression = expressionContext ?? {};
  const outcome = actionReceipt.outcome ?? {};
  const outcomeEvidence = actionReceipt.qualityEvidence ?? null;
  const learningContext = outcomeEvidence?.learningContext ?? {};
  return {
    problemFeatures: firstPopulated(expression.problemFeatures, learningContext.problemProfile),
    outcome,
    morphology: firstPopulated(expression.morphology, learningContext.initialMorphology),
    outcomeEvidence,
    evidenceQuality: outcomeEvidence ? 1 : 0,
    tokenCost: actionReceipt.tokenCost ?? 0,
    latency: actionReceipt.latency ?? 0
  };
}

function firstPopulated(primary, fallback) {
  if (primary && typeof primary === 'object' && Object.keys(primary).length > 0) return primary;
  return fallback ?? {};
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
  const input = normalizeContext(ctx);
  if (input.error) return input.error;
  const replay = idempotentReplay(input);
  if (replay) return replay;
  const receipt = applyLearningPipeline(input);
  rememberIdempotentReceipt(input, receipt);
  return receipt;
}

function normalizeContext(ctx) {
  const input = ctx || {};
  if (!input.actionReceipt || !input.agentId) return { error: { error: 'invalid_context', receipt: null } };
  if (Boolean(input.organizationId) !== Boolean(input.projectId)) {
    return { error: { error: 'invalid_scope', receipt: null } };
  }
  const context = { ...input, organizationId: input.organizationId || null, projectId: input.projectId || null };
  context.idempotencyKey = String(input.idempotencyKey || '').trim();
  context.fingerprint = context.idempotencyKey && crypto.createHash('sha256')
    .update(JSON.stringify({ agentId: context.agentId, organizationId: context.organizationId,
      projectId: context.projectId, actionReceipt: context.actionReceipt })).digest('hex');
  return context;
}

function idempotentReplay(input) {
  if (!input.idempotencyKey) return null;
  const previous = idempotentReceipts.get(input.idempotencyKey);
  if (!previous) return null;
  if (previous.fingerprint !== input.fingerprint) return { error: 'idempotency_conflict', receipt: null };
  return previous.receipt;
}

function rememberIdempotentReceipt(input, receipt) {
  if (!input.idempotencyKey) return;
  idempotentReceipts.set(input.idempotencyKey, { fingerprint: input.fingerprint, receipt });
  if (idempotentReceipts.size > MAX_HISTORY) idempotentReceipts.delete(idempotentReceipts.keys().next().value);
}

function applyLearningPipeline(input) {
  const { actionReceipt, agentId, expressionContext, organizationId, projectId } = input;
  const evidence = actionReceipt.evidence || actionReceipt;
  const outcome = computeOutcome({ receipt: actionReceipt, agentId, organizationId, projectId });
  const rpe = computeRPE(outcome, actionReceipt);
  const evidenceResult = recordEvidence(agentId, evidence);
  const memoryResult = consolidateMemory(outcome, actionReceipt);
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
