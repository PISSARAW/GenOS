/**
 * @file sleepCycle.js
 * @description Hippocampal memory consolidation & microglial synaptic pruning service.
 * Executes active background consolidation cycles on database storage:
 * 1. Asymptotic memory decay on decisions.
 * 2. Differential synaptic consolidation (LTP reinforcement vs LTD depression).
 * 3. Microglial trogocytosis / pruning of C3-tagged & low-weight synapses.
 * 4. Apoptosis / garbage-collection of orphaned weak genome decisions.
 * 5. Trajectory pruning (stale rejected non-exceptional trajectories).
 * 6. Exosome / vesicle absorption into long-term engrams.
 */

const { withTransaction, getDatabase } = require('../db/index');
const synapticTransmission = require('./synapticTransmissionService');

/**
 * Helper: run a single step of the sleep cycle with its own error handling
 */
async function decaySynapticWeights(tx, weightDecayFactor) {
  await tx.run(
    `UPDATE genome_decisions 
     SET synaptic_weight = CASE 
       WHEN category IN ('core', 'golden_path', 'architecture', 'invariant') THEN MAX(1.0, ROUND(synaptic_weight * ?, 4))
       ELSE ROUND(synaptic_weight * ?, 4)
     END`,
    weightDecayFactor, weightDecayFactor
  );
}

async function consolidateSynapses(tx, synapseDecayFactor) {
  await tx.run(`
    UPDATE memory_synapses
    SET weight = CASE WHEN weight < 0 THEN MAX(-20.0, weight - 0.05 * activity_history) ELSE MIN(20.0, weight + 0.05 * activity_history) END,
        receptor_density = MIN(3.0, receptor_density + 0.05),
        c3_opsonization = 0.0,
        cd47_expression = MIN(2.0, cd47_expression + 0.1),
        spine_morphology = CASE WHEN receptor_density + 0.05 >= 1.5 THEN 'mushroom' ELSE 'thin' END
    WHERE activity_history > 0
  `);

  await tx.run(`
    UPDATE memory_synapses
    SET weight = ROUND(weight * ?, 4),
        receptor_density = MAX(0.0, receptor_density - 0.05),
        c3_opsonization = MIN(2.0, c3_opsonization + 0.1),
        cd47_expression = MAX(0.0, cd47_expression - 0.05),
        spine_morphology = CASE WHEN receptor_density - 0.05 < 0.6 THEN 'filopodia' WHEN receptor_density - 0.05 < 1.3 THEN 'stubby' ELSE spine_morphology END
    WHERE activity_history IS NULL OR activity_history = 0
  `, synapseDecayFactor);
}

async function pruneDeadSynapses(tx, opts) {
  const { minTransmissionWeight, c3Threshold, cd47Threshold } = opts;
  return tx.run(
    'DELETE FROM memory_synapses WHERE ABS(weight) < ? OR (c3_opsonization > ? AND cd47_expression < ?)',
    minTransmissionWeight, c3Threshold, cd47Threshold
  );
}

async function resetActivityHistory(tx) {
  await tx.run('UPDATE memory_synapses SET activity_history = 0');
}

async function pruneOrphanedDecisions(tx, opts) {
  const { orphanWeightThreshold, organizationId, projectId } = opts;
  const doomed = await tx.all(`
    SELECT g.id 
    FROM genome_decisions g
    LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
    WHERE g.synaptic_weight < ?
      AND (g.category IS NULL OR g.category NOT IN ('core', 'golden_path', 'architecture', 'invariant'))
      AND (g.organization_id = ? OR g.organization_id IS NULL)
      AND (g.project_id = ? OR g.project_id IS NULL)
    GROUP BY g.id
    HAVING COUNT(s.source_id) = 0 AND COUNT(s.target_id) = 0
  `, orphanWeightThreshold, organizationId || null, projectId || null);

  const doomedIds = doomed.map(d => d.id);
  if (doomedIds.length > 0) {
    const placeholders = doomedIds.map(() => '?').join(',');
    await tx.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, doomedIds);
  }
  return doomedIds.length;
}

async function pruneTrajectories(tx, trajectoryRetentionDays) {
  try {
    const res = await tx.run(`
      DELETE FROM trajectories 
      WHERE is_exceptional = 0 
        AND status = 'rejected' 
        AND datetime(created_at) < datetime('now', '-' || ? || ' days')
    `, trajectoryRetentionDays);
    return res?.changes || 0;
  } catch (_) { return 0; }
}

async function runSleepCycle(db = null, options = {}) {
  const database = db || (await getDatabase());
  if (!database) {
    return {
      success: false,
      consolidated: false,
      memoriesDecayed: false,
      apoptosisCount: 0,
      error: 'Database unavailable.'
    };
  }

  const {
    weightDecayFactor = 0.9,
    synapseDecayFactor = 0.95,
    minTransmissionWeight = 0.05,
    c3Threshold = 0.5,
    cd47Threshold = 0.5,
    orphanWeightThreshold = 0.1,
    trajectoryRetentionDays = 7,
    organizationId = null,
    projectId = null
  } = options;

  try {
    let exosomeStats = { success: true, absorbedCount: 0, engramsStored: 0, plasmidsAssimilated: 0, errors: [] };
    let apoptosisCount = 0;
    let prunedSynapses = 0;

    await withTransaction(database, async (tx) => {
      await decaySynapticWeights(tx, weightDecayFactor);
      await consolidateSynapses(tx, synapseDecayFactor);
      const pruneRes = await pruneDeadSynapses(tx, { minTransmissionWeight, c3Threshold, cd47Threshold });
      prunedSynapses = pruneRes?.changes || 0;
      await resetActivityHistory(tx);
      apoptosisCount = await pruneOrphanedDecisions(tx, {
        orphanWeightThreshold,
        organizationId: options.organizationId || null,
        projectId: options.projectId || null
      });
      const prunedTrajectories = await pruneTrajectories(tx, trajectoryRetentionDays);
      exosomeStats = await synapticTransmission.absorbExosomes(tx);
      exosomeStats.prunedTrajectories = prunedTrajectories;
      exosomeStats.prunedSynapses = prunedSynapses;
    });

    return {
      success: exosomeStats.success !== false,
      consolidated: true,
      memoriesDecayed: true,
      prunedSynapses: exosomeStats.prunedSynapses || 0,
      apoptosisCount: apoptosisCount,
      prunedTrajectories: exosomeStats.prunedTrajectories || 0,
      exosomesAbsorbed: exosomeStats.absorbedCount,
      engramsStored: exosomeStats.engramsStored,
      plasmidsAssimilated: exosomeStats.plasmidsAssimilated,
      errors: exosomeStats.errors || []
    };
  } catch (error) {
    return {
      success: false,
      consolidated: false,
      memoriesDecayed: false,
      apoptosisCount: 0,
      error: error.message
    };
  }
}

module.exports = {
  runSleepCycle,
  sleepCycle: runSleepCycle
};