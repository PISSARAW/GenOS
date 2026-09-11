/**
 * Tree exploration operations for MCTS search: Schizogony burst and backpropagation.
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const genosCli = require('../genosCli');

async function schizogonyBurst(context = {}) {
  const db = await getDatabase();
  const agentId = context.agentId || context.orchestratorId || context.nodeId || 'schizont_root';
  const merozoiteCount = Number(context.merozoiteCount ?? context.count ?? 4);
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

module.exports = { schizogonyBurst, backpropagate };
