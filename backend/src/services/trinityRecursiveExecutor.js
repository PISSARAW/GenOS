'use strict';

const crypto = require('crypto');
const trinityService = require('./trinityService');
const trinityVariants = require('./trinityVariantService');

const MAX_DEPTH = 3;
const DEFAULT_RECURSION_BUDGET = 0.3;
const MIN_MARGINAL_COST = 0.05;

function identifySubProblems(report) {
  const claims = Array.isArray(report.claims) ? report.claims : [];
  const uncertainties = Array.isArray(report.uncertainties) ? report.uncertainties : [];
  const subProblems = [];
  for (const claim of claims) {
    if (claim.falsificationCriteria && claim.falsificationCriteria.length > 0) {
      subProblems.push({
        id: subProblemId('falsification', claim.statement),
        type: 'falsification',
        description: claim.statement,
        criteria: claim.falsificationCriteria,
        parentClaimId: claim.id,
        severity: claim.verificationLevel === 'unverified' ? 'high' : 'medium'
      });
    }
  }
  for (const unc of uncertainties) {
    subProblems.push({
      id: subProblemId('uncertainty', unc),
      type: 'uncertainty',
      description: unc,
      parentClaimId: null,
      severity: 'medium'
    });
  }
  return subProblems.slice(0, 5);
}

function subProblemId(type, description) {
  const text = typeof description === 'string' ? description : JSON.stringify(description);
  return 'sub_' + crypto.createHash('sha256').update(type + ':' + text.trim().replace(/\s+/g, ' ').toLowerCase()).digest('hex').slice(0, 32);
}

function selectSubProblem(subProblems, parentEvidenceVector) {
  if (!subProblems.length) return null;
  const withUncertainty = subProblems.map(sp => ({
    ...sp,
    uncertaintyWeight: parentEvidenceVector?.uncertainty || 0.5
  }));
  withUncertainty.sort((a, b) => {
    const sevOrder = { high: 3, medium: 2, low: 1 };
    return (sevOrder[b.severity] - sevOrder[a.severity]) || (b.uncertaintyWeight - a.uncertaintyWeight);
  });
  return withUncertainty[0];
}

function shouldRecurse(input) {
  const { subProblem, config = {}, depth = 0, spentBudget = 0 } = input;
  if (depth >= (config.maxDepth || MAX_DEPTH)) return { allow: false, reason: 'max_depth_reached' };
  if (spentBudget >= recursionBudget(config)) return { allow: false, reason: 'budget_exhausted' };
  const marginalCost = estimateMarginalCost(subProblem, config);
  if (spentBudget + marginalCost > recursionBudget(config)) return { allow: false, reason: 'budget_exhausted' };
  if (marginalCost < (config.minMarginalCost || MIN_MARGINAL_COST)) return { allow: false, reason: 'marginal_cost_below_threshold' };
  if (wouldCreateCycle(subProblem, config.parentProblemIds || [])) return { allow: false, reason: 'cycle_detected' };
  return { allow: true, marginalCost };
}

function recursionBudget(config) { return config.recursionBudget ?? DEFAULT_RECURSION_BUDGET; }

function estimateMarginalCost(subProblem, config) {
  const baseCost = config.baseCostPerRecursion || 0.1;
  const complexity = subProblem.criteria?.length || 1;
  return baseCost * (1 + complexity * 0.2);
}

function wouldCreateCycle(subProblem, parentIds) {
  return parentIds.includes(subProblem.id) || parentIds.includes(subProblem.parentClaimId);
}

function buildRecursiveMission(parentMission, subProblem, parentEvidenceVector) {
  return `${parentMission}\n\nRECURSIVE SUB-PROBLEM (depth limited):\nFocus: ${subProblem.description}\nType: ${subProblem.type}\nParent Evidence Uncertainty: ${parentEvidenceVector?.uncertainty || 'unknown'}\nFalsification Criteria: ${subProblem.criteria?.join('; ') || 'none'}\nReturn a verified result with evidence vector, not raw text.`;
}

async function executeRecursiveTrinity(input) {
  const { mission, parentReport, config = {}, depth = 0, spentBudget = 0, parentProblemIds = [] } = input;
  const subProblems = identifySubProblems(parentReport);
  const subProblem = selectSubProblem(subProblems, parentReport.evidenceVector);
  if (!subProblem) return { status: 'no_subproblem', result: null };
  const recursionCheck = shouldRecurse({ subProblem, config, depth, spentBudget });
  if (!recursionCheck.allow) return { status: 'recursion_blocked', reason: recursionCheck.reason, subProblem };
  if (typeof input.runNestedTrinity !== 'function') {
    return { status: 'unavailable', reason: 'nested_runtime_unavailable', subProblem };
  }
  const recursiveMission = buildRecursiveMission(mission, subProblem, parentReport.evidenceVector);
  const variantSelection = trinityVariants.selectForMission(recursiveMission, {
    ...config,
    variantId: config.recursiveVariant || 'controlled',
    experimentalDesign: config.recursiveDesign
  });
  const analysis = trinityService.analyzeMission(recursiveMission);
  const members = analysis.members.map((member, index) => ({
    ...member,
    worldNumber: index + 1,
    mission: `Recursive Trinity (depth ${depth + 1}): ${recursiveMission}\nDomain: ${analysis.domain}\nSealed chamber: ${member.chamber}\nWorld strategy: ${member.hypothesis}`
  }));
  const worlds = trinityVariants.applyToMembers(members, variantSelection);
  const newParentIds = [...parentProblemIds, subProblem.id, subProblem.parentClaimId].filter(Boolean);
  const childInput = { ...input, mission: recursiveMission, config: { ...config, parentProblemIds: newParentIds }, depth: depth + 1, spentBudget: spentBudget + recursionCheck.marginalCost };
  const childResults = await input.runNestedTrinity(childInput);
  if (!completeChildEvidence(childResults, config)) {
    return { status: 'escalated', reason: 'nested_runtime_returned_incomplete_worlds', subProblem, childResults };
  }
  const merged = trinityService.mergeTrinityEvidence(childResults, { domain: analysis.domain, threshold: config.threshold || 0.7 });
  return {
    status: merged.canMerge ? 'verified' : 'escalated',
    subProblem,
    depth: depth + 1,
    variant: variantSelection.variant,
    experimentalDesignId: variantSelection.experimentalDesignId,
    childResults,
    mergedResult: merged, childPromotion: childPromotionReceipt(childResults),
    evidenceGraphEdge: {
      from: parentReport.worldNumber || 'parent',
      to: `recursive_${depth + 1}`,
      type: 'recursive_decomposition',
      subProblemId: subProblem.id,
      verificationLevel: merged.canMerge ? 'verified' : 'escalated'
    }
  };
}

function completeChildEvidence(results, config) {
  return validChildResults(results) && !missingChildPromotion(results, config);
}
function childPromotionReceipt(results) { return results.childPromotion || null; }

function missingChildPromotion(results, config) {
  return config.requireChildPromotion === true && results?.childPromotion?.promoted !== true;
}

function validChildResults(results) {
  return Array.isArray(results) && results.length === 3
    && results.every((world, index) => world?.worldNumber === index + 1 && world.report?.outcome === 'success' && !world.report.failure);
}

module.exports = { executeRecursiveTrinity, identifySubProblems, selectSubProblem, shouldRecurse, buildRecursiveMission, MAX_DEPTH, DEFAULT_RECURSION_BUDGET, MIN_MARGINAL_COST };
