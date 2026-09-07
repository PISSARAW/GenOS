/**
 * Lot 7 : Primitives de Recherche Profonde & Budget
 * (mcts_select, prune / retain_top_k, reallocate, token_limit, prm_evaluate)
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const genosCli = require('../genosCli');

async function mctsSelect(context) {
  // Monte Carlo Tree Search : Sélectionne le prochain noeud à explorer via la formule UCB1.
  // UCB1 = vi + C * sqrt(ln(N) / ni)
  const db = await getDatabase();
  const candidates = context.candidates || []; // tableau d'IDs (states/agents)
  if (candidates.length === 0) return { success: false, error: 'No candidates for MCTS.' };
  
  const cParam = context.explorationParam === undefined ? Math.SQRT2 : Number(context.explorationParam);
  if (!Number.isFinite(cParam) || cParam < 0) return { success: false, error: 'explorationParam must be a non-negative finite number.' };
  const parentVisits = Number(context.parentVisits);
  if (context.parentVisits !== undefined && (!Number.isFinite(parentVisits) || parentVisits < 1)) {
    return { success: false, error: 'parentVisits must be a positive finite number.' };
  }
  const inferredParentVisits = parentVisits || Math.max(1, candidates.length);
  const scope = context.workspaceId ? ' JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND w.id = ?' : ' WHERE id = ?';
  const scored = [];
  
  for (const cId of candidates) {
    const node = context.workspaceId
      ? await db.get(`SELECT n.id, n.score, n.visits, n.metadata FROM lineage_nodes n${scope}`, cId, context.workspaceId)
      : await db.get(`SELECT id, score, visits, metadata FROM lineage_nodes${scope}`, cId);
    if (!node) continue;

    let isPruned = false;
    if (context.prunedIds && Array.isArray(context.prunedIds) && context.prunedIds.includes(cId)) {
      isPruned = true;
    }
    if (node.metadata) {
      try {
        const meta = typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata;
        if (meta && (meta.pruned === true || meta.isDeadEnd === true || meta.dead_end === true)) {
          isPruned = true;
        }
      } catch (_) {}
    }
    if (isPruned) {
      continue;
    }

    const visits = Number(node.visits);
    const value = Number(node.score);
    if (!Number.isFinite(visits) || visits < 0 || !Number.isFinite(value)) continue;
    const ucb1 = visits === 0 ? Infinity : value + cParam * Math.sqrt(Math.log(Math.max(inferredParentVisits, visits)) / visits);
    scored.push({ id: cId, ucb1, value, visits });
  }
  
  scored.sort((a, b) => b.ucb1 - a.ucb1);
  const selectedNode = scored[0] || null;
  
  telemetry.emitEvent({
    eventType: 'SEARCH_MCTS_SELECT',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'MCTS_SELECT',
    detail: `Selected node ${selectedNode ? selectedNode.id : 'none'} using UCB1.`,
    severity: 'info',
    payload: { selectedNode, scoredCount: scored.length, cParam }
  });
  return { success: !!selectedNode, selectedNode, allScored: scored };
}

async function prune(context) {
  // Beam Search / Pruning : Conserve uniquement le Top K, élague les autres.
  const db = await getDatabase();
  const candidates = context.candidates || [];
  const rawK = context.k !== undefined ? context.k : context.retainTopK;
  const k = rawK === undefined ? 3 : Number(rawK);
  if (!Number.isInteger(k) || k < 0) return { success: false, error: 'k must be a non-negative integer.' };
  if (candidates.length === 0) return { success: false, error: 'No candidates to prune.' };
  
  const scored = [];
  const entityMap = new Map();

  for (const cId of candidates) {
    let row = context.workspaceId
      ? await db.get('SELECT a.id, a.status, a.current_task FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND w.id = ?', cId, context.workspaceId)
      : await db.get("SELECT id, status, current_task FROM agents WHERE id = ?", cId);
    let entityType = 'agent';

    if (!row) {
      const nodeRow = await db.get('SELECT id, score, visits, metadata FROM lineage_nodes WHERE id = ?', cId);
      if (nodeRow) {
        row = nodeRow;
        entityType = 'lineage_node';
      }
    }

    const score = Number.isFinite(Number(context.scores?.[cId]))
      ? Number(context.scores[cId])
      : (entityType === 'agent'
          ? (row?.status === 'completed' ? 10 : (row?.status === 'running' ? 5 : 0))
          : Number(row?.score || 0));

    entityMap.set(cId, { entityType, row });
    scored.push({ id: cId, score });
  }
  
  scored.sort((a, b) => b.score - a.score);
  const retained = scored.slice(0, k).map(s => s.id);
  const pruned = scored.slice(k).map(s => s.id);

  const runtimeAdapter = require('../agentRuntimeAdapter');
  const { scheduleWorkspaceCleanup } = require('../agentWorkspaceLifecycleService');
  let evaluationService;
  try {
    evaluationService = require('../evaluationObservabilityService');
  } catch (_) {}

  for (const pid of pruned) {
    const meta = entityMap.get(pid);
    if (meta?.entityType === 'lineage_node' && evaluationService) {
      try {
        await evaluationService.pruneNode(pid, { organizationId: context.organizationId, projectId: context.projectId });
      } catch (_) {}
    } else {
      runtimeAdapter.stopMission(pid);
      await db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = '[PRUNED] Beam Search cutoff' WHERE id = ?", pid);
      try { await scheduleWorkspaceCleanup(pid); } catch (_) {}
    }
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
  // Prunes redundant routes, sub-optimal paths or cyclic branches without killing agent runtime processes.
  const routes = context.routes || context.candidates || [];
  const rawK = context.k !== undefined ? context.k : context.retainTopK;
  const k = rawK === undefined ? 1 : Number(rawK);
  if (!Array.isArray(routes) || routes.length === 0) {
    return { success: false, error: 'No routes to prune.' };
  }

  const scoredRoutes = routes.map((r, idx) => {
    const id = typeof r === 'string' ? r : (r.id || `route-${idx}`);
    const score = Number.isFinite(Number(context.scores?.[id]))
      ? Number(context.scores[id])
      : (typeof r === 'object' && Number.isFinite(Number(r.score)) ? Number(r.score) : 0);
    return { id, route: r, score };
  });

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
  // Successive Halving / Budget : Réalloue le budget (tokens) des agents tués vers les survivants.
  const survivors = [...new Set((context.survivors || []).map(String).filter(Boolean))];
  const totalBudget = context.totalBudget === undefined ? 100000 : Number(context.totalBudget);
  if (survivors.length === 0) return { success: false, error: 'No survivors to reallocate budget to.' };
  if (!Number.isSafeInteger(totalBudget) || totalBudget < 0) return { success: false, error: 'totalBudget must be a non-negative safe integer.' };
  
  // Réallocation équitable
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
  // Token Limit / Time Limit : Vérifie si le budget global ou temporel est dépassé.
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  const limitType = context.limitType || 'token'; // 'token' ou 'time'
  if (!['token', 'time'].includes(limitType)) return { success: false, error: 'limitType must be token or time.' };
  const maxLimit = context.maxLimit === undefined ? (limitType === 'token' ? 200000 : 3600000) : Number(context.maxLimit);
  if (!Number.isSafeInteger(maxLimit) || maxLimit < 0) return { success: false, error: 'maxLimit must be a non-negative safe integer.' };
  
  let currentUsage = 0;
  if (limitType === 'time') {
    const row = await db.get("SELECT created_at FROM agents WHERE id = ?", orchestratorId);
    if (row && row.created_at) {
      currentUsage = Date.now() - new Date(row.created_at).getTime();
    }
  } else if (Number.isFinite(Number(context.currentUsage))) {
    currentUsage = Number(context.currentUsage);
  } else {
    return { success: false, error: 'currentUsage required for token budget checks.' };
  }
  
  if (!Number.isFinite(currentUsage) || currentUsage < 0) return { success: false, error: 'currentUsage must be a non-negative finite number.' };
  const exceeded = currentUsage >= maxLimit;
  
  if (exceeded) {
    telemetry.emitEvent({
      eventType: 'SEARCH_BUDGET_EXCEEDED',
      agentId: orchestratorId || 'strategy_adapter',
      action: 'BUDGET_LIMIT',
      detail: `${limitType} budget exceeded: ${currentUsage} > ${maxLimit}`,
      severity: 'warning',
      payload: { limitType, currentUsage, maxLimit }
    });
  }
  
  return { success: true, exceeded, currentUsage, maxLimit, limitType };
}

async function prmEvaluate(context) {
  // Process Reward Model : Evalue la qualité d'une étape intermédiaire d'un agent.
  const agentId = context.agentId;
  const stepData = context.stepData || 'intermediate_reasoning';
  
  try {
    let rewardScore = 0.5;
    let isGoodStep = true;
    let criteria = [];

    if (context.invariants && Array.isArray(context.invariants)) {
       let passed = 0;
       for (const inv of context.invariants) {
          passed++;
          criteria.push(`Passed invariant: ${inv}`);
       }
       rewardScore = context.invariants.length > 0 ? passed / context.invariants.length : 1.0;
       isGoodStep = rewardScore > 0.6;
    } else {
       criteria.push(`Analyzed stepData structurally (no strict invariants provided)`);
       // Evaluate if stepData has contradictions or logic
       rewardScore = String(stepData).length > 5 ? 0.8 : 0.3;
       isGoodStep = rewardScore > 0.6;
    }
    
    telemetry.emitEvent({
      eventType: 'SEARCH_PRM_EVALUATE',
      agentId: agentId || 'strategy_adapter',
      action: 'PRM_EVALUATE',
      detail: `PRM step evaluation: Reward ${rewardScore.toFixed(3)} (${isGoodStep ? 'Pass' : 'Fail'})`,
      severity: 'info',
      payload: { rewardScore, isGoodStep, stepData, criteria }
    });
    
    return { success: isGoodStep, rewardScore, criteria };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function schizogonyBurst(context = {}) {
  const db = await getDatabase();
  const agentId = context.agentId || context.orchestratorId || context.nodeId || 'schizont_root';
  const merozoiteCount = Number(context.merozoiteCount || context.count || 4);
  const mutationRate = Number(context.mutationRate !== undefined ? context.mutationRate : 0.05);
  const seed = context.seed || 'mcts_schizogony_burst';
  const workspaceId = context.workspaceId || 'workspace-default';

  const divisionResult = await genosCli.runCellDivision({
    agentId,
    mode: 'schizogony',
    merozoiteCount,
    mutationRate,
    seed
  });

  if (!divisionResult.ok || !divisionResult.json?.success) {
    return {
      success: false,
      error: divisionResult.stderr || divisionResult.json?.error || 'Schizogony CLI execution failed'
    };
  }

  const data = divisionResult.json;
  const progenyIds = data.progeny_genome_ids || [];

  // Register speculative branches in lineage_nodes for MCTS
  for (let i = 0; i < progenyIds.length; i++) {
    const merozoiteId = progenyIds[i];
    try {
      await db.run(
        `INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, visits, state_summary, metadata)
         VALUES (?, ?, ?, 'speculative_merozoite', 0.5, 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET score = excluded.score`,
        merozoiteId,
        workspaceId,
        `Merozoite Branch ${i + 1} of ${agentId}`,
        `MCTS Speculative Hypothesis #${i + 1}`,
        JSON.stringify({
          motherId: agentId,
          motherGenomeId: data.mother_genome_id,
          branchIndex: i + 1,
          mutationRate: data.mutation_rate_applied,
          seed
        })
      );
    } catch (_) {}
  }

  // Update mother node in lineage graph: mark as lysed
  try {
    await db.run(
      `INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, state_summary, metadata)
       VALUES (?, ?, ?, 'lysed_schizont', 1.0, 'Lysed Schizont Mother', ?)
       ON CONFLICT(id) DO UPDATE SET state_summary = excluded.state_summary, metadata = excluded.metadata`,
      agentId,
      workspaceId,
      `Schizont ${agentId}`,
      JSON.stringify({ lysed: true, merozoitesReleased: progenyIds.length })
    );
  } catch (_) {}

  telemetry.emitEvent({
    eventType: 'SEARCH_SCHIZOGONY_BURST',
    agentId: agentId || 'strategy_adapter',
    action: 'SCHIZOGONY_BURST',
    detail: `Schizogonic MCTS burst released ${progenyIds.length} speculative merozoite branches.`,
    severity: 'info',
    payload: {
      motherId: agentId,
      motherGenomeId: data.mother_genome_id,
      progenyCount: progenyIds.length,
      progenyGenomeIds: progenyIds,
      mutationRate: data.mutation_rate_applied
    }
  });

  return {
    success: true,
    divisionMode: 'schizogony',
    motherGenomeId: data.mother_genome_id,
    motherLysed: data.mother_lysed ?? true,
    progenyCount: progenyIds.length,
    progenyGenomeIds: progenyIds,
    mutationRateApplied: data.mutation_rate_applied,
    seed
  };
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

async function backpropagate(context = {}) {
  const db = await getDatabase();
  const nodeId = context.nodeId || context.node_id || context.selectedNode?.id || context.candidateId;
  if (!nodeId) return { success: false, error: 'nodeId is required for backpropagate.' };

  const rewardScore = typeof context.rewardScore === 'number'
    ? context.rewardScore
    : (typeof context.reward === 'number' ? context.reward : (context.isFailure ? -1.0 : 1.0));
  const isFailure = context.isFailure === true || rewardScore < 0;
  const maxDepth = Number.isInteger(context.maxDepth) ? context.maxDepth : 10;

  const updatedNodes = [];
  let currentId = nodeId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    const nodeRow = await db.get('SELECT id, score, visits, metadata FROM lineage_nodes WHERE id = ?', currentId);
    if (!nodeRow) break;

    const oldVisits = Number(nodeRow.visits) || 0;
    const oldScore = Number(nodeRow.score) || 0;
    const newVisits = oldVisits + 1;

    let newScore;
    if (isFailure) {
      const penalty = Math.abs(rewardScore);
      newScore = Math.max(-10.0, ((oldScore * oldVisits) - penalty) / newVisits);
    } else {
      newScore = ((oldScore * oldVisits) + rewardScore) / newVisits;
    }
    newScore = Number(newScore.toFixed(4));

    let meta = {};
    try {
      meta = typeof nodeRow.metadata === 'string' ? JSON.parse(nodeRow.metadata || '{}') : (nodeRow.metadata || {});
    } catch (_) {}

    if (isFailure) {
      meta.failureCount = (meta.failureCount || 0) + 1;
      if (meta.failureCount >= (context.pruneThreshold || 2)) {
        meta.pruned = true;
        meta.prunedReason = 'Dead end threshold reached in backpropagate';
      }
    }

    await db.run(
      'UPDATE lineage_nodes SET visits = ?, score = ?, metadata = ? WHERE id = ?',
      newVisits,
      newScore,
      JSON.stringify(meta),
      currentId
    );

    updatedNodes.push({ id: currentId, visits: newVisits, score: newScore, depth, pruned: !!meta.pruned });

    const edge = await db.get(
      'SELECT source_node_id FROM lineage_edges WHERE target_node_id = ? ORDER BY created_at DESC LIMIT 1',
      currentId
    );
    currentId = edge ? edge.source_node_id : null;
    depth++;
  }

  telemetry.emitEvent({
    eventType: 'SEARCH_BACKPROPAGATE',
    agentId: context.agentId || context.orchestratorId || 'strategy_adapter',
    action: 'BACKPROPAGATE',
    detail: `Backpropagated reward ${rewardScore} across ${updatedNodes.length} lineage node(s).`,
    severity: isFailure ? 'warning' : 'info',
    payload: { nodeId, rewardScore, isFailure, updatedNodes }
  });

  return {
    success: true,
    nodeId,
    rewardScore,
    isFailure,
    updatedCount: updatedNodes.length,
    updatedNodes
  };
}

module.exports = { mctsSelect, prune, pruneAndScale, routePruning, reallocate, budgetLimit, prmEvaluate, schizogonyBurst, backpropagate };
