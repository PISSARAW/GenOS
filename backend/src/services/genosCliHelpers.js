/**
 * Helper functions extracted from genosCli.js so every function stays within
 * the complexity and parameter budgets enforced by the quality gate.
 */

function orDefault(value, fallback) {
  return value == null ? fallback : value;
}

function pushString(args, flag, value) {
  if (value !== undefined) args.push(flag, String(value));
}

function pushGenes(args, flag, value) {
  if (value) {
    args.push(flag, typeof value === 'string' ? value : JSON.stringify(value));
  }
}

function buildCrossoverReplay(parentA, parentB, options) {
  return {
    version: 'genos-crossover-v1',
    parentA,
    parentB,
    genesA: orDefault(options.genesA, null),
    genesB: orDefault(options.genesB, null),
    swapProb: orDefault(options.swapProb, 0.5),
    crossoverPoint: orDefault(options.crossoverPoint, null),
    speciationThreshold: orDefault(options.speciationThreshold, null),
    seed: orDefault(options.seed, 'genos-default-crossover')
  };
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function resolveWorkspaceId(mother) {
  if (!mother) return 'workspace-default';
  return mother.workspace_id || 'workspace-default';
}

function resolveLineageNodeType(reproductionMode) {
  return reproductionMode === 'schizogony' ? 'speculative_merozoite' : reproductionMode;
}

function collectProgenyIds(payload, reproductionMode) {
  if (reproductionMode === 'mitosis') return [payload.clone_genome_id];
  if (reproductionMode === 'binary_fission') return [payload.daughter_b_id || payload.child_genome_id];
  if (reproductionMode === 'budding') return [payload.daughter_genome_id];
  if (reproductionMode === 'schizogony') return arrayOrEmpty(payload.progeny_genome_ids);
  if (reproductionMode === 'meiosis') return arrayOrEmpty(payload.gamete_genome_ids);
  return [];
}

async function recordDivisionLineage(db, context) {
  const parentGenomeId = context.parentGenomeId;
  if (!parentGenomeId || !context.progenyIds.length) return;
  const nodeType = resolveLineageNodeType(context.reproductionMode);
  await db.run(
    `INSERT OR IGNORE INTO lineage_nodes (id, workspace_id, agent_id, label, node_type, state_summary)
           VALUES (?, ?, ?, ?, 'agent', 'Reproduction parent')`,
    context.agentId,
    context.workspaceId,
    context.agentId,
    `Reproduction parent ${context.agentId}`
  );
  const descendants = context.progenyIds.filter(Boolean).filter((id) => id !== parentGenomeId);
  for (const [index, progenyId] of descendants.entries()) {
    await db.run(
      `INSERT INTO lineage_nodes (id, workspace_id, label, node_type, score, visits, state_summary, metadata)
             VALUES (?, ?, ?, ?, 0.5, 0, 'Reproduction descendant', ?)
             ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id, node_type = excluded.node_type, state_summary = excluded.state_summary, metadata = excluded.metadata`,
      progenyId,
      context.workspaceId,
      `${context.reproductionMode} descendant ${index + 1} of ${context.agentId}`,
      nodeType,
      JSON.stringify({ parentAgentId: context.agentId, motherAgentId: context.reproductionMode === 'schizogony' ? context.agentId : undefined, parentGenomeId, branchIndex: index, reproductionMode: context.reproductionMode, seed: context.payload.seed })
    );
    await db.run(
      `INSERT INTO lineage_edges (id, workspace_id, source_node_id, target_node_id, edge_type, metadata)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
      `edge_${context.agentId}_${progenyId}`,
      context.workspaceId,
      context.agentId,
      progenyId,
      context.reproductionMode,
      JSON.stringify({ reproductionMode: context.reproductionMode, branchIndex: index })
    );
  }
}

async function applyDivisionState(db, agentId, payload) {
  const isApoptotic = payload.mother_lysed ? 1 : 0;
  const isSenescent = payload.is_senescent || payload.remaining_buds === 0;
  if (isApoptotic) {
    await db.run(
      `UPDATE agents SET is_apoptotic = 1, status = 'apoptosis', cognitive_budget = 0, current_task = 'Lysed following schizogony', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      agentId
    ).catch(() => {});
    await db.run(
      `UPDATE lineage_nodes SET state_summary = 'Lysed mother cell (schizogony burst)' WHERE id = ? OR agent_id = ?`,
      agentId, agentId
    ).catch(() => {});
    return;
  }
  if (isSenescent) {
    await db.run(
      `UPDATE lineage_nodes SET state_summary = 'Replicative Senescence (Hayflick limit)' WHERE id = ? OR agent_id = ?`,
      agentId, agentId
    ).catch(() => {});
  }
}

async function persistDivisionOutcome(agentId, mode, payload) {
  const { getDatabase } = require('../db');
  const db = await getDatabase();
  const reproductionMode = String(payload.division_mode || mode).toLowerCase();
  const mother = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agentId).catch(() => null);
  const workspaceId = resolveWorkspaceId(mother);
  const parentGenomeId = payload.parent_genome_id || payload.mother_genome_id;
  const progenyIds = collectProgenyIds(payload, reproductionMode);
  await recordDivisionLineage(db, { agentId, workspaceId, reproductionMode, payload, parentGenomeId, progenyIds });
  await applyDivisionState(db, agentId, payload);
}

module.exports = {
  pushString,
  pushGenes,
  buildCrossoverReplay,
  persistDivisionOutcome
};
