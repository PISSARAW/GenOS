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
  
  const cParam = context.explorationParam || 1.414;
  const scored = [];
  
  for (const cId of candidates) {
    // Dans une DB réelle, on aurait une table mcts_nodes. On simule avec des stats d'agent.
    const node = await db.get(`SELECT id, status FROM agents WHERE id = ?`, cId);
    if (!node) continue;
    
    // Valeurs simulées pour l'exemple (en production, issues de telemetry/mcts)
    const visits = Math.max(1, Math.floor(Math.random() * 20));
    const value = Math.random(); 
    const parentVisits = visits * 3;
    
    const ucb1 = value + cParam * Math.sqrt(Math.log(parentVisits) / visits);
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
  const k = context.k || context.retainTopK || 3;
  if (candidates.length === 0) return { success: false, error: 'No candidates to prune.' };
  
  const scored = [];
  for (const cId of candidates) {
    const row = await db.get("SELECT id, status, current_task FROM agents WHERE id = ?", cId);
    if (!row) continue;
    // Score basique (en prod, score Brier ou PRM)
    const score = row.status === 'completed' ? 10 : (row.status === 'running' ? 5 : Math.random() * 4);
    scored.push({ id: cId, score });
  }
  
  scored.sort((a, b) => b.score - a.score);
  const retained = scored.slice(0, k).map(s => s.id);
  const pruned = scored.slice(k).map(s => s.id);
  
  for (const pid of pruned) {
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
  } else {
    // Simuler consommation de tokens
    currentUsage = Math.floor(Math.random() * (maxLimit * 1.2)); // Peut dépasser pour le test
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
