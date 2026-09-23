'use strict';

const crypto = require('crypto');
const morphogenesisPlannerService = require('../morphogenesis/morphogenesisPlannerService');

function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

function mapToTopology(type) {
  const map = {
    strategy: 'n_way_counterfactual_fork',
    capability: 'specialist_expert_committee',
    dna: 'specialist_expert_committee',
    plasmid: 'specialist_expert_committee',
    communication_policy: 'broadcast_mesh',
    relationship: 'collaborative_pair',
    worker_allocation: 'dynamic_pool',
  };
  return map[type] || 'specialist_expert_committee';
}

function buildPlannerCtx(collectiveState, cfType) {
  return {
    currentState: {
      agents: collectiveState ? collectiveState.agents : new Map(),
      topologyState: collectiveState ? collectiveState.topologyState : {},
      budgets: collectiveState ? collectiveState.budgets : {},
      currentMorphologyVersion: collectiveState ? collectiveState.currentMorphologyVersion : 0,
    },
    proposedTopology: mapToTopology(cfType),
    reason: 'counterfactual_promotion:' + cfType,
    budget: collectiveState ? collectiveState.budgets : {},
  };
}

async function recordLineage(db, world, intervention) {
  const lineageId = 'cfle_' + uuid();
  if (db) {
    await db.run(
      `INSERT INTO counterfactual_lineage_edges
       (id, parent_world_id, child_world_id, edge_type, intervention_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [lineageId, world.parent_world_id || world.base_snapshot_id,
       world.id, 'promotion', JSON.stringify(intervention), nowIso()]);
  }
}

async function discardSiblings(db, winner, worldRegistry) {
  for (const [id, w] of worldRegistry.entries()) {
    if (id !== winner.id && w.status === 'evaluated') {
      w.status = 'discarded';
      if (db) await db.run(
        `UPDATE counterfactual_worlds SET status = ?, discarded_at = ? WHERE id = ?`,
        ['discarded', nowIso(), id]);
    }
  }
}

async function promoteWinner(ctx) {
  const { db, collectiveState, winner, worldRegistry } = ctx;
  if (!winner || winner.normalized_effect <= 0) {
    return { promoted: false, reason: 'no_positive_winner' };
  }
  const world = worldRegistry.get(winner.world_id);
  if (!world) return { promoted: false, reason: 'winning_world_not_found' };
  const intervention = JSON.parse(world.intervention_json);
  const plannerCtx = buildPlannerCtx(collectiveState, world.counterfactual_type);
  let plan;
  try {
    plan = morphogenesisPlannerService.planMorphogenesis(plannerCtx);
  } catch (err) {
    return { promoted: false, reason: 'planning_failed', error: err.message };
  }
  const validation = morphogenesisPlannerService.validatePlan({
    plan,
    constraints: { autoApprove: false, maxRetire: 5, maxSpawn: 5,
      minPreserve: 1, maxBudgetImpact: 10000 },
  });
  if (!validation.valid) {
    return { promoted: false, reason: 'validation_failed', errors: validation.errors };
  }
  world.status = 'promoted';
  const receipt = {
    winnerWorldId: world.id, counterfactualType: world.counterfactual_type,
    normalizedEffect: winner.normalized_effect, confidence: winner.confidence,
    promotedAt: nowIso(), planId: plan.id || null,
  };
  if (db) {
    await db.run(`UPDATE counterfactual_worlds SET status = ?, promoted_at = ? WHERE id = ?`,
      ['promoted', receipt.promotedAt, world.id]);
    await db.run(`UPDATE counterfactual_results SET promotion_receipt_json = ? WHERE id = ?`,
      [JSON.stringify(receipt), winner.id]);
  }
  await recordLineage(db, world, intervention);
  await discardSiblings(db, world, worldRegistry);
  return { promoted: true, worldId: world.id, receipt, plan };
}

module.exports = { mapToTopology, buildPlannerCtx, promoteWinner, recordLineage, discardSiblings };
