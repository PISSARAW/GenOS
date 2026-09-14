function mctsScope(workspaceId) {
  return workspaceId ? ' JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND w.id = ?' : ' WHERE id = ?';
}

function parseMctsParams(context, candidateCount) {
  const cParam = context.explorationParam === undefined ? Math.SQRT2 : Number(context.explorationParam);
  if (!Number.isFinite(cParam) || cParam < 0) {
    return { error: 'explorationParam must be a non-negative finite number.' };
  }
  const parentVisits = Number(context.parentVisits);
  if (context.parentVisits !== undefined && (!Number.isFinite(parentVisits) || parentVisits < 1)) {
    return { error: 'parentVisits must be a positive finite number.' };
  }
  const inferredParentVisits = parentVisits || Math.max(1, candidateCount);
  return { cParam, inferredParentVisits };
}

async function loadMctsNode(env, cId) {
  if (env.context.workspaceId) {
    return env.db.get(`SELECT n.id, n.score, n.visits, n.metadata FROM lineage_nodes n${env.scope}`, cId, env.context.workspaceId);
  }
  return env.db.get(`SELECT id, score, visits, metadata FROM lineage_nodes${env.scope}`, cId);
}

function metaIsPruned(metadata) {
  if (!metadata) return false;
  try {
    const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    return !!(meta && (meta.pruned === true || meta.isDeadEnd === true || meta.dead_end === true));
  } catch (_) {
    return false;
  }
}

function isPrunedCandidate(context, cId, node) {
  if (context.prunedIds && Array.isArray(context.prunedIds) && context.prunedIds.includes(cId)) return true;
  if (metaIsPruned(node.metadata)) return true;
  return false;
}

async function evaluateMctsCandidate(env, cId) {
  const node = await loadMctsNode(env, cId);
  if (!node) return { status: 'missing' };
  if (isPrunedCandidate(env.context, cId, node)) return { status: 'pruned' };

  const visits = Number(node.visits);
  const value = Number(node.score);
  if (!Number.isFinite(visits) || visits < 0 || !Number.isFinite(value)) return { status: 'invalid' };

  const ucb1 = visits === 0 ? Infinity : value + env.cParam * Math.sqrt(Math.log(Math.max(env.inferredParentVisits, visits)) / visits);
  return { status: 'scored', entry: { id: cId, ucb1, value, visits } };
}

function applyMctsOutcome(outcome, scored, counters) {
  if (outcome.status === 'missing') { counters.missingCount++; return; }
  if (outcome.status === 'pruned') { counters.prunedCount++; return; }
  if (outcome.status === 'invalid') { counters.invalidScoreCount++; return; }
  scored.push(outcome.entry);
}

function compareMcts(a, b) {
  const aInfinite = a.ucb1 === Infinity;
  const bInfinite = b.ucb1 === Infinity;
  if (aInfinite && bInfinite) return (b.value || 0) - (a.value || 0);
  if (aInfinite) return -1;
  if (bInfinite) return 1;
  return (b.ucb1 || 0) - (a.ucb1 || 0);
}

function mctsReason(stats) {
  if (stats.selectedNode) return null;
  if (stats.scoredCount !== 0) return null;
  if (stats.missingCount === stats.candidateCount) return 'all_candidates_missing';
  if (stats.prunedCount === stats.candidateCount) return 'all_candidates_pruned';
  if (stats.invalidScoreCount > 0) return 'all_candidates_invalid';
  return 'no_selectable_candidates';
}

function parsePruneK(context) {
  const rawK = context.k !== undefined ? context.k : context.retainTopK;
  return rawK === undefined ? 3 : Number(rawK);
}

function pruneAgentScore(row) {
  if (row && row.status === 'completed') return 10;
  if (row && row.status === 'running') return 5;
  return 0;
}

function pruneCandidateScore(context, cId, entity) {
  const scores = context.scores;
  const provided = Number(scores ? scores[cId] : undefined);
  if (Number.isFinite(provided)) return provided;
  if (entity.entityType === 'agent') return pruneAgentScore(entity.row);
  return Number((entity.row && entity.row.score) || 0);
}

async function loadPruneEntity(db, context, cId) {
  const agentRow = context.workspaceId
    ? await db.get('SELECT a.id, a.status, a.current_task FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND w.id = ?', cId, context.workspaceId)
    : await db.get('SELECT id, status, current_task FROM agents WHERE id = ?', cId);
  if (agentRow) return { row: agentRow, entityType: 'agent' };
  const nodeRow = await db.get('SELECT id, score, visits, metadata FROM lineage_nodes WHERE id = ?', cId);
  if (nodeRow) return { row: nodeRow, entityType: 'lineage_node' };
  return { row: null, entityType: 'agent' };
}

function loadPruneDeps(context) {
  const runtimeAdapter = require('../agentRuntimeAdapter');
  const { scheduleWorkspaceCleanup } = require('../agentWorkspaceLifecycleService');
  let evaluationService;
  try {
    evaluationService = require('../evaluationObservabilityService');
  } catch (_) {}
  return { runtimeAdapter, scheduleWorkspaceCleanup, evaluationService, context };
}

async function applyPrune(env, pid) {
  const meta = env.entityMap.get(pid);
  if (meta && meta.entityType === 'lineage_node' && env.evaluationService) {
    try {
      await env.evaluationService.pruneNode(pid, { organizationId: env.context.organizationId, projectId: env.context.projectId });
    } catch (_) {}
    return;
  }
  env.runtimeAdapter.stopMission(pid);
  await env.db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = '[PRUNED] Beam Search cutoff' WHERE id = ?", pid);
  try { await env.scheduleWorkspaceCleanup(pid); } catch (_) {}
}

function routeList(context) {
  return context.routes || context.candidates || [];
}

function parseRouteK(context) {
  const rawK = context.k !== undefined ? context.k : context.retainTopK;
  return rawK === undefined ? 1 : Number(rawK);
}

function routeFallbackId(r, idx) {
  return r.id || `route-${idx}`;
}

function routeScore(context, id, r) {
  const scores = context.scores;
  const provided = Number(scores ? scores[id] : undefined);
  if (Number.isFinite(provided)) return provided;
  if (typeof r !== 'object') return 0;
  return Number.isFinite(Number(r.score)) ? Number(r.score) : 0;
}

function scoreRoute(context, r, idx) {
  const id = typeof r === 'string' ? r : routeFallbackId(r, idx);
  return { id, route: r, score: routeScore(context, id, r) };
}

function parseBudgetLimit(context) {
  const limitType = context.limitType || 'token';
  if (!['token', 'time'].includes(limitType)) return { error: 'limitType must be token or time.' };
  const maxLimit = context.maxLimit === undefined ? (limitType === 'token' ? 200000 : 3600000) : Number(context.maxLimit);
  if (!Number.isSafeInteger(maxLimit) || maxLimit < 0) return { error: 'maxLimit must be a non-negative safe integer.' };
  return { limitType, maxLimit };
}

async function resolveTimeUsage(db, orchestratorId) {
  const row = await db.get('SELECT created_at FROM agents WHERE id = ?', orchestratorId);
  if (row && row.created_at) return Date.now() - new Date(row.created_at).getTime();
  return 0;
}

async function resolveCurrentUsage(db, context, limitType) {
  if (limitType === 'time') return resolveTimeUsage(db, context.orchestratorId);
  if (Number.isFinite(Number(context.currentUsage))) return Number(context.currentUsage);
  return { error: 'currentUsage required for token budget checks.' };
}

function invariantResult(inv) {
  if (typeof inv === 'object' && inv !== null) return inv.passed;
  return inv;
}

function invariantPassed(inv) {
  const result = invariantResult(inv);
  if (result === true) return true;
  return typeof result === 'object' && result !== null && result.passed === true;
}

function invariantLabel(inv) {
  if (typeof inv === 'object' && inv !== null) return inv.name || inv.id || 'unnamed';
  return inv;
}

function evaluateInvariants(context, criteria) {
  let passed = 0;
  for (const inv of context.invariants) {
    if (invariantPassed(inv)) {
      passed++;
      criteria.push(`Passed invariant: ${invariantLabel(inv)}`);
      continue;
    }
    criteria.push(`Failed or unverified invariant: ${JSON.stringify(inv)}`);
  }
  const total = context.invariants.length;
  const rewardScore = total > 0 ? passed / total : 1.0;
  return { rewardScore, isGoodStep: rewardScore > 0.6 };
}

function evaluateStepData(stepData) {
  const rewardScore = String(stepData).length > 5 ? 0.8 : 0.3;
  return { rewardScore, isGoodStep: rewardScore > 0.6 };
}

function evaluatePrm(context, stepData) {
  const criteria = [];
  if (context.invariants && Array.isArray(context.invariants)) {
    const outcome = evaluateInvariants(context, criteria);
    return { rewardScore: outcome.rewardScore, isGoodStep: outcome.isGoodStep, criteria };
  }
  criteria.push(`Analyzed stepData structurally (no strict invariants provided)`);
  const outcome = evaluateStepData(stepData);
  return { rewardScore: outcome.rewardScore, isGoodStep: outcome.isGoodStep, criteria };
}

module.exports = {
  mctsScope,
  parseMctsParams,
  evaluateMctsCandidate,
  applyMctsOutcome,
  compareMcts,
  mctsReason,
  parsePruneK,
  loadPruneEntity,
  pruneCandidateScore,
  loadPruneDeps,
  applyPrune,
  routeList,
  parseRouteK,
  scoreRoute,
  parseBudgetLimit,
  resolveCurrentUsage,
  evaluatePrm
};
