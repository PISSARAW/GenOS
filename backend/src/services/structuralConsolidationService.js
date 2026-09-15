'use strict';

/**
 * @file structuralConsolidationService.js
 * @description Service de consolidation structurelle — exécuté sur déclenchement
 * sleepCycle ou manuellement.
 */

const { getDatabase, withTransaction } = require('../db');
const { causalWeighting, contextCompaction } = require('./primitiveHandlers/structuralPlasticity');
const telemetry = require('./telemetryObserver');
const { firstTruthy, firstNonNull } = require('./primitiveHandlers/searchHelpers');

async function runConsolidationCycle(context = {}) {
  const db = await getDatabase();
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, context.orchestrator_id, 'structural_consolidation');
  const trigger = firstTruthy(context.trigger, context.source, 'manual');
  const dryRun = Boolean(firstTruthy(context.dryRun, context.dry_run));
  const weightThreshold = Number(firstNonNull(context.weightThreshold, context.pruneThreshold, 0.05));
  const causalThreshold = Number(firstNonNull(context.causalThreshold, 0.2));

  if (weightThreshold < 0 || weightThreshold > 1) {
    return { success: false, error: 'weightThreshold doit être entre 0 et 1.' };
  }

  const timestamp = new Date().toISOString();

  // Phase 1 : pondération causale
  const causalResult = await causalWeighting({ ...context, threshold: weightThreshold });
  if (!causalResult.success) return { success: false, error: `Phase 1 (causal) échouée: ${causalResult.error || 'inconnu'}` };

  // Phases 2+3 : décompte ou application
  const structuralCounts = dryRun
    ? countStructuralCandidates(db, weightThreshold, causalThreshold)
    : await applyStructuralChanges({ db, weightThreshold, causalThreshold, timestamp });

  // Phase 4 : compaction contextuelle
  const compactionResult = await contextCompaction({ ...context, weightThreshold, dryRun });

  const totalEffects = structuralCounts.pruned + structuralCounts.stabilized +
    (compactionResult.pruned_synapses || 0) + (compactionResult.pruned_episodes || 0);

  telemetry.emitEvent({
    eventType: 'STRUCTURAL_CONSOLIDATION_COMPLETE', agentId, action: 'STRUCTURAL_CONSOLIDATION',
    detail: `Cycle de consolidation structurelle terminé (trigger=${trigger}, dryRun=${dryRun}): ${structuralCounts.pruned} pruned, ${structuralCounts.stabilized} stabilisées, ${compactionResult.compacted || 0} compactées.`,
    severity: 'info',
    payload: { trigger, dryRun, phase1_causal: causalResult.weighted, phase2_pruned: structuralCounts.pruned, phase3_stabilized: structuralCounts.stabilized, phase4_compacted: compactionResult.compacted || 0, totalEffects }
  });

  return {
    success: true, trigger, dry_run: dryRun, timestamp,
    phases: {
      causal: { weighted: causalResult.weighted, mean_strength: causalResult.mean_causal_strength },
      pruning: { pruned: structuralCounts.pruned, threshold: weightThreshold },
      stabilization: { stabilized: structuralCounts.stabilized, threshold: causalThreshold },
      compaction: compactionResult
    },
    total_effects: totalEffects,
    reason: `Consolidation structurelle terminée (trigger=${trigger}).`
  };
}

function countStructuralCandidates(db, weightThreshold, causalThreshold) {
  const pruneCount = db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE weight < ? AND causal_strength < ?`, weightThreshold, causalThreshold);
  const stableCount = db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE weight >= ? AND causal_strength >= ?`, weightThreshold, causalThreshold);
  return Promise.all([pruneCount, stableCount]).then(([p, s]) => ({ pruned: p.cnt, stabilized: s.cnt }));
}

async function applyStructuralChanges(opts) {
  const { db, weightThreshold, causalThreshold, timestamp } = opts;
  let prunedCount = 0;
  let stabilizedCount = 0;
  await withTransaction(db, async (tx) => {
    const pruned = await tx.all(`SELECT source_id, target_id, weight FROM memory_synapses WHERE weight < ? AND causal_strength < ?`, weightThreshold, causalThreshold);
    for (const p of pruned) {
      await tx.run(`DELETE FROM memory_synapses WHERE source_id = ? AND target_id = ?`, p.source_id, p.target_id);
    }
    prunedCount = pruned.length;
    const strong = await tx.all(`SELECT source_id, target_id, weight, receptor_density FROM memory_synapses WHERE weight >= ? AND causal_strength >= ?`, weightThreshold, causalThreshold);
    for (const s of strong) {
      const newDensity = Math.min(3.0, (s.receptor_density || 1.0) + 0.05);
      await tx.run(
        `UPDATE memory_synapses SET receptor_density = ?, spine_morphology = CASE WHEN ? >= 2.5 THEN 'mushroom' WHEN ? >= 1.5 THEN 'stubby' ELSE spine_morphology END, last_stabilized_at = ? WHERE source_id = ? AND target_id = ?`,
        Number(newDensity.toFixed(3)), newDensity, newDensity, timestamp, s.source_id, s.target_id
      );
    }
    stabilizedCount = strong.length;
  });
  return { pruned: prunedCount, stabilized: stabilizedCount };
}

async function getSynapticGraphSummary(context = {}) {
  const db = await getDatabase();
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'structural_consolidation');

  const [total, strong, weak, avgWeight, avgReceptor, mushroom, stubby, thin, byCompartment] = await Promise.all([
    db.get('SELECT COUNT(*) as cnt FROM memory_synapses'),
    db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE weight >= 0.1`),
    db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE weight < 0.1`),
    db.get(`SELECT AVG(weight) as avg FROM memory_synapses`),
    db.get(`SELECT AVG(receptor_density) as avg FROM memory_synapses`),
    db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE spine_morphology = 'mushroom'`),
    db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE spine_morphology = 'stubby'`),
    db.get(`SELECT COUNT(*) as cnt FROM memory_synapses WHERE spine_morphology = 'thin'`),
    db.all(`SELECT compartment_type, COUNT(*) as cnt, AVG(weight) as avg_weight FROM memory_synapses WHERE compartment_type IS NOT NULL GROUP BY compartment_type`)
  ]);

  return {
    success: true,
    total: total.cnt, strong: strong.cnt, weak: weak.cnt,
    average_weight: Number(avgWeight.avg || 0).toFixed(4),
    average_receptor_density: Number(avgReceptor.avg || 0).toFixed(3),
    morphology: { mushroom: mushroom.cnt, stubby: stubby.cnt, thin: thin.cnt },
    by_compartment: byCompartment,
    agent_id: agentId,
    reason: 'Résumé du graphe synaptique actuel.'
  };
}

module.exports = { runConsolidationCycle, getSynapticGraphSummary };
