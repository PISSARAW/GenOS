/**
 * Lot 6 : Primitives Temporelles & Causales
 * (causal_replay, mutated_universes, causal_rebase, dependency_matrix, provenance)
 */
const telemetry = require('../telemetryObserver');
const mcpExecutor = require('../mcpExecutor');
const { getDatabase } = require('../../db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function causalReplay(context) {
  // Rejoue une séquence d'événements passés avec une intervention pour observer la divergence causale.
  const agentId = context.agentId || context.orchestratorId;
  const inputFile = context.inputFile;
  const outputFile = context.outputFile || `/tmp/causal_report_${Date.now()}.json`;

  if (!inputFile || !fs.existsSync(inputFile)) {
    return { success: false, error: 'Existing inputFile required for causal replay.' };
  }

  const res = await mcpExecutor.execute({
    agentId: agentId || 'strategy_adapter',
    toolName: 'genos_causal_replay_experiment',
    args: { input_file: inputFile, output_file: outputFile }
  });

  telemetry.emitEvent({
    eventType: 'TEMPORAL_CAUSAL_REPLAY',
    agentId: agentId || 'strategy_adapter',
    action: 'CAUSAL_REPLAY',
    detail: `Executed causal replay. Output at ${outputFile}`,
    severity: 'info',
    payload: { success: res.success, outputFile }
  });
  return { success: res.success, outputFile, mcpResult: res };
}

async function mutatedUniverses(context) {
  // Crée plusieurs lignes temporelles alternatives (forks causaux) à partir d'un même point.
  const agentId = context.agentId || context.orchestratorId;
  const boundaryId = context.boundaryId || 'root_boundary';
  const universesCount = context.universesCount || 3;
  const newBoundaries = [];
  
  for (let i = 0; i < universesCount; i++) {
    const newBoundary = `universe_${crypto.randomBytes(4).toString('hex')}`;
    const res = await mcpExecutor.execute({
      agentId: agentId || 'strategy_adapter',
      toolName: 'genos_causality_fork',
      args: { boundary_id: boundaryId, new_boundary_id: newBoundary }
    });
    if (res.success) {
      newBoundaries.push(newBoundary);
    }
  }

  telemetry.emitEvent({
    eventType: 'TEMPORAL_MUTATED_UNIVERSES',
    agentId: agentId || 'strategy_adapter',
    action: 'MUTATED_UNIVERSES',
    detail: `Created ${newBoundaries.length} alternative universes from boundary ${boundaryId}.`,
    severity: 'info',
    payload: { originalBoundary: boundaryId, newBoundaries }
  });
  return { success: newBoundaries.length > 0, universes: newBoundaries };
}

async function causalRebase(context) {
  // Injecte un changement dans le passé et re-calcule le plan d'exécution futur.
  const agentId = context.agentId || context.orchestratorId;
  const graphFile = context.graphFile;
  const injectionStep = context.injectionStep || 'step_1';
  const injectedKeys = context.injectedKeys || ['altered_state'];

  if (!graphFile || !fs.existsSync(graphFile)) {
    return { success: false, error: 'Existing graphFile required for causal rebase.' };
  }

  const res = await mcpExecutor.execute({
    agentId: agentId || 'strategy_adapter',
    toolName: 'genos_rebase_compute_plan',
    args: { graph_file: graphFile, injection_step: injectionStep, injected_keys: injectedKeys }
  });

  telemetry.emitEvent({
    eventType: 'TEMPORAL_CAUSAL_REBASE',
    agentId: agentId || 'strategy_adapter',
    action: 'CAUSAL_REBASE',
    detail: `Rebased causal compute plan at step ${injectionStep}.`,
    severity: 'warning',
    payload: { graphFile, injectionStep, injectedKeys, success: res.success }
  });
  return { success: res.success, mcpResult: res };
}

async function dependencyMatrix(context) {
  // Génère la matrice d'adjacence des dépendances causales d'une séquence.
  // Utile pour identifier les "goulots d'étranglement" ou les composants non corrélés.
  const db = await getDatabase();
  const orchestratorId = context.orchestratorId;
  
  if (!orchestratorId) return { success: false, error: 'orchestratorId required.' };

  // On lit les memory_synapses pour les agents de cet orchestrateur
  const rows = await db.all(
    `SELECT s.source_id, s.target_id, s.weight
       FROM memory_synapses s
       JOIN genome_decisions source_node ON source_node.id = s.source_id
       JOIN genome_decisions target_node ON target_node.id = s.target_id
      WHERE source_node.created_by = ? OR target_node.created_by = ?
      ORDER BY s.last_updated_at DESC LIMIT 100`,
    orchestratorId, orchestratorId
  );
  
  const matrix = {};
  rows.forEach(r => {
    if (!matrix[r.source_id]) matrix[r.source_id] = {};
    matrix[r.source_id][r.target_id] = r.weight;
  });

  telemetry.emitEvent({
    eventType: 'TEMPORAL_DEPENDENCY_MATRIX',
    agentId: orchestratorId,
    action: 'DEPENDENCY_MATRIX',
    detail: `Computed dependency matrix with ${Object.keys(matrix).length} nodes.`,
    severity: 'info',
    payload: { nodeCount: Object.keys(matrix).length }
  });
  return { success: true, matrix };
}

async function provenance(context) {
  // Remonte l'arbre généalogique / causal pour trouver l'origine d'un état ou d'une erreur.
  const db = await getDatabase();
  const targetId = context.targetId || context.agentId;
  if (!targetId) return { success: false, error: 'targetId required for provenance.' };

  const lineage = [];
  let currentId = targetId;

  // Remonte de parent en parent jusqu'à la racine (max depth 10)
  for (let i = 0; i < 10; i++) {
    const agent = await db.get(`SELECT id, parent_agent_id, lineage_relation, current_task FROM agents WHERE id = ?`, currentId);
    if (!agent) break;
    
    lineage.push({
      id: agent.id,
      relation: agent.lineage_relation,
      task: agent.current_task
    });
    
    if (!agent.parent_agent_id || agent.parent_agent_id === agent.id) break;
    currentId = agent.parent_agent_id;
  }

  telemetry.emitEvent({
    eventType: 'TEMPORAL_PROVENANCE',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'PROVENANCE',
    detail: `Traced provenance for ${targetId} back ${lineage.length} generations.`,
    severity: 'info',
    payload: { targetId, lineageDepth: lineage.length, rootId: lineage[lineage.length - 1]?.id }
  });
  
  return { success: true, lineage, rootId: lineage[lineage.length - 1]?.id };
}

module.exports = { causalReplay, mutatedUniverses, causalRebase, dependencyMatrix, provenance };
