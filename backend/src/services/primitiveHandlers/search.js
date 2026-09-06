/**
 * Lot 7 : Primitives de Recherche Profonde & Budget
 * (mcts_select, prune / retain_top_k, reallocate, token_limit, prm_evaluate)
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');

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
  const scope = context.workspaceId ? ' JOIN workspaces w ON w.id = n.workspace_id WHERE n.id = ? AND w.id = ?' : ' WHERE n.id = ?';
  const scored = [];
  
  for (const cId of candidates) {
    const node = context.workspaceId
      ? await db.get(`SELECT n.id, n.score, n.visits FROM lineage_nodes n${scope}`, cId, context.workspaceId)
      : await db.get(`SELECT id, score, visits FROM lineage_nodes${scope}`, cId);
    if (!node) continue;

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
  // Beam Search / Pruning : Conserve uniquement le Top K, tue les autres.
  const db = await getDatabase();
  const candidates = context.candidates || [];
  const rawK = context.k !== undefined ? context.k : context.retainTopK;
  const k = rawK === undefined ? 3 : Number(rawK);
  if (!Number.isInteger(k) || k < 0) return { success: false, error: 'k must be a non-negative integer.' };
  if (candidates.length === 0) return { success: false, error: 'No candidates to prune.' };
  
  const scored = [];
  for (const cId of candidates) {
    const row = context.workspaceId
      ? await db.get('SELECT a.id, a.status, a.current_task FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND w.id = ?', cId, context.workspaceId)
      : await db.get("SELECT id, status, current_task FROM agents WHERE id = ?", cId);
    if (!row) continue;
    const score = Number.isFinite(Number(context.scores?.[cId]))
      ? Number(context.scores[cId])
      : (row.status === 'completed' ? 10 : (row.status === 'running' ? 5 : 0));
    scored.push({ id: cId, score });
  }
  
  scored.sort((a, b) => b.score - a.score);
  const retained = scored.slice(0, k).map(s => s.id);
  const pruned = scored.slice(k).map(s => s.id);
  const runtimeAdapter = require('../agentRuntimeAdapter');
  for (const pid of pruned) {
    runtimeAdapter.stopMission(pid);
    await db.run("UPDATE agents SET status = 'apoptosis', is_apoptotic = 1, cognitive_budget = 0, current_task = '[PRUNED] Beam Search cutoff' WHERE id = ?", pid);
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

async function reallocate(context) {
  // Successive Halving / Budget : Réalloue le budget (tokens) des agents tués vers les survivants.
  const survivors = context.survivors || [];
  const totalBudget = context.totalBudget || 100000;
  if (survivors.length === 0) return { success: false, error: 'No survivors to reallocate budget to.' };
  
  // Réallocation équitable
  const budgetPerSurvivor = Math.floor(totalBudget / survivors.length);
  const allocations = {};
  survivors.forEach(s => allocations[s] = budgetPerSurvivor);
  
  telemetry.emitEvent({
    eventType: 'SEARCH_REALLOCATE',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'REALLOCATE',
    detail: `Reallocated budget: ${budgetPerSurvivor} tokens per survivor (${survivors.length} survivors).`,
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
  const maxLimit = context.maxLimit || (limitType === 'token' ? 200000 : 3600000); // 200k tokens ou 1h
  
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
  
  const exceeded = currentUsage > maxLimit;
  
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
  const evaluation = require('../evaluationObservabilityService');
  const agentId = context.agentId;
  const stepData = context.stepData || 'intermediate_reasoning';
  
  try {
    // En prod, appellerait un modèle RM (Reward Model) spécifique.
    // Ici on réutilise l'infrastructure ImpossibleBench de Brier score.
    const evalResult = await evaluation.runImpossibleBench({ task: `PRM_Eval: ${stepData}` });
    
    // Convertir le brier (0 = parfait, 1 = nul) en reward score (1 = parfait, 0 = nul)
    const rewardScore = Math.max(0, 1 - (evalResult.brier_score || 0));
    const isGoodStep = rewardScore > 0.6; // Seuil de validation de l'étape
    
    telemetry.emitEvent({
      eventType: 'SEARCH_PRM_EVALUATE',
      agentId: agentId || 'strategy_adapter',
      action: 'PRM_EVALUATE',
      detail: `PRM step evaluation: Reward ${rewardScore.toFixed(3)} (${isGoodStep ? 'Pass' : 'Fail'})`,
      severity: 'info',
      payload: { rewardScore, isGoodStep, stepData }
    });
    
    return { success: isGoodStep, rewardScore, metrics: evalResult };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { mctsSelect, prune, reallocate, budgetLimit, prmEvaluate };
