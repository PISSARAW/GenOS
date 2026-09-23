'use strict';

const crypto = require('crypto');

// In-memory store for decision receipts
const receipts = new Map(); // decisionId -> receipt
const agentIndex = new Map(); // agentId -> decisionId[]
const missionIndex = new Map(); // missionId -> decisionId[]

function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

// ---------------------------------------------------------------------------
// recordDecision — capture a morphology decision with full provenance
// ---------------------------------------------------------------------------

function recordDecision(ctx) {
  const { agentId, decisionType, trigger, expressionContext, expectedBenefit } = ctx;
  const decisionId = `dec-${uuid().slice(0, 8)}`;
  const timestamp = nowIso();

  const receipt = {
    decisionId,
    timestamp,
    agentId,
    decisionType,
    trigger: trigger || 'unknown',
    epistemicPressure: extractEpistemicPressure(expressionContext),
    regulatoryPressure: extractRegulatoryPressure(expressionContext),
    memoryUsed: extractMemoryRefs(expressionContext),
    cognitiveChange: extractCognitiveChange(expressionContext),
    strategyChange: extractStrategyChange(expressionContext),
    topologyChange: extractTopologyChange(expressionContext),
    expectedBenefit: expectedBenefit ?? null,
    rollbackPlan: expressionContext?.rollbackPlan || null,
    outcome: null
  };

  receipts.set(decisionId, receipt);

  if (!agentIndex.has(agentId)) agentIndex.set(agentId, []);
  agentIndex.get(agentId).push(decisionId);

  const missionId = expressionContext?.missionId || 'unknown';
  if (!missionIndex.has(missionId)) missionIndex.set(missionId, []);
  missionIndex.get(missionId).push(decisionId);

  return receipt;
}

function extractEpistemicPressure(ctx) {
  if (!ctx) return { uncertainty: 0, contradiction: 0, evidenceDeficit: 0 };
  return {
    uncertainty: ctx.uncertainty ?? ctx.epistemic?.uncertainty ?? 0,
    contradiction: ctx.contradiction ?? ctx.epistemic?.contradiction ?? 0,
    evidenceDeficit: ctx.evidenceDeficit ?? ctx.epistemic?.evidenceDeficit ?? 0
  };
}

function extractRegulatoryPressure(ctx) {
  if (!ctx) return { stress: 0, energy: 0, drive: 0 };
  return {
    stress: ctx.stress ?? ctx.regulatory?.stress ?? 0,
    energy: ctx.energy ?? ctx.regulatory?.energy ?? 0,
    drive: ctx.drive ?? ctx.regulatory?.drive ?? 0
  };
}

function extractMemoryRefs(ctx) {
  if (!ctx) return [];
  return ctx.memoryUsed || ctx.memories || ctx.memoryRefs || [];
}

function extractCognitiveChange(ctx) {
  if (!ctx) return { before: null, after: null };
  return {
    before: ctx.recipeBefore || ctx.cognitive?.before || null,
    after: ctx.recipeAfter || ctx.cognitive?.after || null
  };
}

function extractStrategyChange(ctx) {
  if (!ctx) return { before: null, after: null };
  return {
    before: ctx.strategyBefore || ctx.strategy?.before || null,
    after: ctx.strategyAfter || ctx.strategy?.after || null
  };
}

function extractTopologyChange(ctx) {
  if (!ctx) return { before: null, after: null };
  return {
    before: ctx.topologyBefore || ctx.topology?.before || null,
    after: ctx.topologyAfter || ctx.topology?.after || null
  };
}

// ---------------------------------------------------------------------------
// completeDecision — fill in the outcome after execution
// ---------------------------------------------------------------------------

function completeDecision(ctx) {
  const { decisionId, outcome } = ctx;
  const receipt = receipts.get(decisionId);
  if (!receipt) throw new Error(`decision ${decisionId} not found`);

  receipt.outcome = {
    ...(outcome || {}),
    completedAt: nowIso(),
    success: outcome?.success ?? outcome?.status === 'success'
  };

  return receipt;
}

// ---------------------------------------------------------------------------
// getDecisionHistory — retrieve decisions for an agent
// ---------------------------------------------------------------------------

function getDecisionHistory(agentId) {
  const ids = agentIndex.get(agentId) || [];
  return ids.map((id) => receipts.get(id)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// getDecisionStats — statistics for an agent's decisions
// ---------------------------------------------------------------------------

function getDecisionStats(agentId) {
  const decisions = getDecisionHistory(agentId);
  const decisionsByType = {};
  let totalExpectedBenefit = 0;
  let successCount = 0;
  let completedCount = 0;

  for (const d of decisions) {
    decisionsByType[d.decisionType] = (decisionsByType[d.decisionType] || 0) + 1;
    if (d.expectedBenefit != null) totalExpectedBenefit += d.expectedBenefit;
    if (d.outcome) {
      completedCount++;
      if (d.outcome.success) successCount++;
    }
  }

  return {
    decisionsByType,
    avgExpectedBenefit: decisions.length > 0 ? totalExpectedBenefit / decisions.length : 0,
    successRate: completedCount > 0 ? successCount / completedCount : 0,
    total: decisions.length
  };
}

// ---------------------------------------------------------------------------
// exportDecisions — export all decisions for a mission
// ---------------------------------------------------------------------------

function exportDecisions(missionId) {
  const ids = missionIndex.get(missionId) || [];
  return ids.map((id) => receipts.get(id)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  recordDecision,
  completeDecision,
  getDecisionHistory,
  getDecisionStats,
  exportDecisions
};
