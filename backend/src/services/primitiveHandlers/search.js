/**
 * Lot 7 : Primitives de Recherche Profonde & Budget
 * (mcts_select, prune / retain_top_k, reallocate, token_limit, prm_evaluate)
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const { schizogonyBurst, backpropagate } = require('./searchTreeOps');
const helpers = require('./searchHelpers');

async function mctsSelect(context) {
  const db = await getDatabase();
  const candidates = context.candidates || [];
  if (candidates.length === 0) return { success: false, error: 'No candidates for MCTS.' };

  const params = helpers.parseMctsParams(context, candidates.length);
  if (params.error) return { success: false, error: params.error };

  const scope = helpers.mctsScope(context.workspaceId);
  const scored = [];
  const counters = { missingCount: 0, prunedCount: 0, invalidScoreCount: 0 };
  const env = { db, context, scope, cParam: params.cParam, inferredParentVisits: params.inferredParentVisits };

  for (const cId of candidates) {
    helpers.applyMctsOutcome(await helpers.evaluateMctsCandidate(env, cId), scored, counters);
  }

  scored.sort(helpers.compareMcts);
  const selectedNode = scored[0] || null;

  telemetry.emitEvent({
    eventType: 'SEARCH_MCTS_SELECT',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'MCTS_SELECT',
    detail: `Selected node ${selectedNode ? selectedNode.id : 'none'} using UCB1.`,
    severity: 'info',
    payload: { selectedNode, scoredCount: scored.length, cParam: params.cParam }
  });
  return {
    success: !!selectedNode,
    selectedNode,
    allScored: scored,
    reason: helpers.mctsReason({
      selectedNode,
      scoredCount: scored.length,
      candidateCount: candidates.length,
      missingCount: counters.missingCount,
      prunedCount: counters.prunedCount,
      invalidScoreCount: counters.invalidScoreCount
    }),
    diagnostics: {
      candidateCount: candidates.length,
      missingCount: counters.missingCount,
      prunedCount: counters.prunedCount,
      invalidScoreCount: counters.invalidScoreCount
    }
  };
}

async function prune(context) {
  const db = await getDatabase();
  const candidates = context.candidates || [];
  const k = helpers.parsePruneK(context);
  if (!Number.isInteger(k) || k < 0) return { success: false, error: 'k must be a non-negative integer.' };
  if (candidates.length === 0) return { success: false, error: 'No candidates to prune.' };

  const scored = [];
  const entityMap = new Map();
  for (const cId of candidates) {
    const entity = await helpers.loadPruneEntity(db, context, cId);
    entityMap.set(cId, entity);
    scored.push({ id: cId, score: helpers.pruneCandidateScore(context, cId, entity) });
  }

  scored.sort((a, b) => b.score - a.score);
  const retained = scored.slice(0, k).map(s => s.id);
  const pruned = scored.slice(k).map(s => s.id);

  const env = Object.assign(helpers.loadPruneDeps(context), { db, entityMap });
  for (const pid of pruned) {
    await helpers.applyPrune(env, pid);
  }

  telemetry.emitEvent({
    eventType: 'SEARCH_PRUNE',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'PRUNE',
    detail: `Retained top ${retained.length}, pruned ${pruned.length} candidates.`,
    severity: 'info',
    payload: { retained, pruned, k }
  });
  return { success: true, retained, pruned };
}

async function routePruning(context) {
  const routes = helpers.routeList(context);
  const k = helpers.parseRouteK(context);
  if (!Array.isArray(routes) || routes.length === 0) {
    return { success: false, error: 'No routes to prune.' };
  }

  const scoredRoutes = routes.map((r, idx) => helpers.scoreRoute(context, r, idx));
  scoredRoutes.sort((a, b) => b.score - a.score);
  const retained = scoredRoutes.slice(0, k).map(r => r.route);
  const pruned = scoredRoutes.slice(k).map(r => r.route);

  telemetry.emitEvent({
    eventType: 'ROUTE_PRUNED',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'ROUTE_PRUNING',
    detail: `Route pruning kept ${retained.length} optimal routes, pruned ${pruned.length} suboptimal routes.`,
    severity: 'info',
    payload: { retainedCount: retained.length, prunedCount: pruned.length, k }
  });

  return { success: true, retained, pruned };
}

async function reallocate(context) {
  const survivors = [...new Set((context.survivors || []).map(String).filter(Boolean))];
  const totalBudget = context.totalBudget === undefined ? 100000 : Number(context.totalBudget);
  if (survivors.length === 0) return { success: false, error: 'No survivors to reallocate budget to.' };
  if (!Number.isSafeInteger(totalBudget) || totalBudget < 0) return { success: false, error: 'totalBudget must be a non-negative safe integer.' };

  const budgetPerSurvivor = Math.floor(totalBudget / survivors.length);
  const remainder = totalBudget % survivors.length;
  const allocations = {};
  survivors.forEach((s, index) => { allocations[s] = budgetPerSurvivor + (index < remainder ? 1 : 0); });

  telemetry.emitEvent({
    eventType: 'SEARCH_REALLOCATE',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'REALLOCATE',
    detail: `Reallocated ${totalBudget} tokens across ${survivors.length} survivors.`,
    severity: 'info',
    payload: { allocations, totalBudget }
  });
  return { success: true, allocations, budgetPerSurvivor };
}

async function budgetLimit(context) {
  const db = await getDatabase();
  const limit = helpers.parseBudgetLimit(context);
  if (limit.error) return { success: false, error: limit.error };

  const usage = await helpers.resolveCurrentUsage(db, context, limit.limitType);
  if (usage.error) return { success: false, error: usage.error };
  if (!Number.isFinite(usage) || usage < 0) return { success: false, error: 'currentUsage must be a non-negative finite number.' };

  const exceeded = usage >= limit.maxLimit;
  if (exceeded) {
    telemetry.emitEvent({
      eventType: 'SEARCH_BUDGET_EXCEEDED',
      agentId: context.orchestratorId || 'strategy_adapter',
      action: 'BUDGET_LIMIT',
      detail: `${limit.limitType} budget exceeded: ${usage} > ${limit.maxLimit}`,
      severity: 'warning',
      payload: { limitType: limit.limitType, currentUsage: usage, maxLimit: limit.maxLimit }
    });
  }

  return { success: true, exceeded, currentUsage: usage, maxLimit: limit.maxLimit, limitType: limit.limitType };
}

async function prmEvaluate(context) {
  const agentId = context.agentId;
  const stepData = context.stepData || 'intermediate_reasoning';
  try {
    const evaluation = helpers.evaluatePrm(context, stepData);
    telemetry.emitEvent({
      eventType: 'SEARCH_PRM_EVALUATE',
      agentId: agentId || 'strategy_adapter',
      action: 'PRM_EVALUATE',
      detail: `PRM step evaluation: Reward ${evaluation.rewardScore.toFixed(3)} (${evaluation.isGoodStep ? 'Pass' : 'Fail'})`,
      severity: 'info',
      payload: { rewardScore: evaluation.rewardScore, isGoodStep: evaluation.isGoodStep, stepData, criteria: evaluation.criteria }
    });

    return { success: evaluation.isGoodStep, rewardScore: evaluation.rewardScore, criteria: evaluation.criteria };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function pruneAndScale(context) {
  const pruneResult = await prune(context);
  if (!pruneResult.success) return pruneResult;
  const reallocateResult = await reallocate({
    ...context,
    survivors: pruneResult.retained
  });
  return {
    success: true,
    retained: pruneResult.retained,
    pruned: pruneResult.pruned,
    reallocation: reallocateResult
  };
}

module.exports = { mctsSelect, prune, pruneAndScale, routePruning, reallocate, budgetLimit, prmEvaluate, schizogonyBurst, backpropagate };
