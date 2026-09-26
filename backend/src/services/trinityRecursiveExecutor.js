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
        id: `sub_${crypto.randomBytes(6).toString('hex')}`,
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
      id: `sub_${crypto.randomBytes(6).toString('hex')}`,
      type: 'uncertainty',
      description: unc,
      parentClaimId: null,
      severity: 'medium'
    });
  }
  return subProblems.slice(0, 5);
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
  if (spentBudget >= (config.recursionBudget || DEFAULT_RECURSION_BUDGET)) return { allow: false, reason: 'budget_exhausted' };
  const marginalCost = estimateMarginalCost(subProblem, config);
  if (marginalCost < (config.minMarginalCost || MIN_MARGINAL_COST)) return { allow: false, reason: 'marginal_cost_below_threshold' };
  if (wouldCreateCycle(subProblem, config.parentProblemIds || [])) return { allow: false, reason: 'cycle_detected' };
  return { allow: true, marginalCost };
}

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
  const { db, mission, parentReport, config = {}, depth = 0, spentBudget = 0, parentProblemIds = [], orchestratorId } = input;
  const subProblems = identifySubProblems(parentReport);
  const subProblem = selectSubProblem(subProblems, parentReport.evidenceVector);
  if (!subProblem) return { status: 'no_subproblem', result: null };
  const recursionCheck = shouldRecurse({ subProblem, config, depth, spentBudget });
  if (!recursionCheck.allow) return { status: 'recursion_blocked', reason: recursionCheck.reason, subProblem };
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
  const childResults = await runTrinityWorlds(childInput);
  const merged = trinityService.mergeTrinityEvidence(childResults, { domain: analysis.domain, threshold: config.threshold || 0.7 });
  return {
    status: 'completed',
    subProblem,
    depth: depth + 1,
    variant: variantSelection.variant,
    experimentalDesignId: variantSelection.experimentalDesignId,
    childResults,
    mergedResult: merged,
    evidenceGraphEdge: {
      from: parentReport.worldNumber || 'parent',
      to: `recursive_${depth + 1}`,
      type: 'recursive_decomposition',
      subProblemId: subProblem.id,
      verificationLevel: merged.canMerge ? 'verified' : 'escalated'
    }
  };
}

async function runTrinityWorlds(input) {
  const { worlds, db } = input;
  const results = [];
  for (const world of worlds) {
    const result = await simulateWorldExecution(world, db);
    results.push({ ...world, report: result });
  }
  return results;
}

async function simulateWorldExecution(world, db) {
  return {
    outcome: 'success',
    evidenceVector: { correctness: 0.8, coverage: 0.7, robustness: 0.75, reproducibility: 0.85, uncertainty: 0.3, risk: 0.2, constraintCoverage: 0.9 },
    evidenceVectorEvidence: { correctness: ['ev1'], coverage: ['ev2'], robustness: ['ev3'], reproducibility: ['ev4'], uncertainty: ['ev5'], risk: ['ev6'], constraintCoverage: ['ev7'] },
    claims: [{ id: 'claim1', statement: 'Recursive sub-problem solved', evidence: ['ev1'], verificationLevel: 'independent_deterministic' }],
    hardConstraintsPassed: true,
    budgetStatus: 'within'
  };
}

module.exports = { executeRecursiveTrinity, identifySubProblems, selectSubProblem, shouldRecurse, buildRecursiveMission, MAX_DEPTH, DEFAULT_RECURSION_BUDGET, MIN_MARGINAL_COST };