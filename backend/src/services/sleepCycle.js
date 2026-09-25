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
const proceduralConsolidation = require('./proceduralConsolidationService');
const fossilization = require('./fossilizationService');

/**
 * Fetch unconsolidated episodic memories for procedural consolidation
 */
async function fetchUnconsolidatedEpisodes(tx) {
  return tx.all(`
    SELECT id, agent_id, session_id, task_id, turn_number, action_type,
           context_state, reward_score, created_at
    FROM episodic_memories
    WHERE is_purged = 0 AND is_consolidated = 0
    ORDER BY session_id, created_at, turn_number
  `);
}

/**
 * Group raw episode rows by session_id
 */
function groupEpisodesBySession(rows) {
  const sessions = {};
  for (const row of rows) {
    const sid = row.session_id || 'no-session';
    if (!sessions[sid]) sessions[sid] = [];
    sessions[sid].push(row);
  }
  return sessions;
}

/**
 * Map sessions into trajectory-episodes for proceduralConsolidationService
 */
function buildTrajectoryEpisodes(sessions) {
  const episodes = [];
  for (const [sessionId, turns] of Object.entries(sessions)) {
    if (turns.length < 2) continue;
    const trajectory = turns.map(t => t.action_type || 'step');
    const avgReward = turns.reduce((s, t) => s + (t.reward_score || 0), 0) / turns.length;
    let context = {};
    try { context = JSON.parse(turns[0].context_state || '{}'); } catch (_) {}
    episodes.push({
      id: `session-${sessionId}`,
      trajectory,
      outcome: avgReward >= 0.5 ? 'success' : 'failure',
      success: avgReward >= 0.5,
      context: { sessionId, taskId: turns[0].task_id, agentId: turns[0].agent_id, ...context },
      observedAt: turns[turns.length - 1].created_at,
    });
  }
  return episodes;
}

/**
 * Store a golden path result in genome_decisions (dédupliqué sur contenu).
 */
async function storeGoldenPath(tx, result, opts) {
  const crypto = require('crypto');
  const title = `Golden Path (${result.path.length} steps, ${Math.round((result.provenance?.successRate || 0) * 100)}% success)`;
  const content = JSON.stringify({
    path: result.path,
    provenance: result.provenance,
    transitionContrast: result.transitionContrast,
  });
  // Dédup : le même chemin consolidé deux fois ne crée qu'une entrée.
  const duplicate = await tx.get(
    `SELECT id FROM genome_decisions WHERE category = 'golden_path' AND content = ? LIMIT 1`,
    content
  ).catch(() => null);
  if (duplicate) return duplicate.id;
  const gpId = crypto.randomUUID();
  await tx.run(
    `INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight, organization_id, project_id)
     VALUES (?, ?, ?, ?, 'golden_path', 1.5, ?, ?)`,
    gpId, title, content, 'sleep-cycle', opts.organizationId || null, opts.projectId || null
  );
  return gpId;
}

/**
 * Batch-mark source episodes as consolidated
 */
async function markEpisodesConsolidated(tx, episodeIds) {
  const BATCH_SIZE = 200;
  for (let i = 0; i < episodeIds.length; i += BATCH_SIZE) {
    const batch = episodeIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    await tx.run(`UPDATE episodic_memories SET is_consolidated = 1 WHERE id IN (${placeholders})`, ...batch);
  }
}

/**
 * Extract episodic memories, consolidate into golden paths, mark sources consolidated
 */
async function consolidateProceduralMemories(tx, opts) {
  const rows = await fetchUnconsolidatedEpisodes(tx);
  if (rows.length < 2) {
    return { consolidated: false, reason: 'insufficient_episodes', goldenPaths: 0, episodesMarked: 0 };
  }
  const sessions = groupEpisodesBySession(rows);
  const episodes = buildTrajectoryEpisodes(sessions);
  if (episodes.length < 2) {
    return { consolidated: false, reason: 'insufficient_trajectories', goldenPaths: 0, episodesMarked: 0 };
  }
  const result = proceduralConsolidation.consolidatePath({}, episodes);
  if (!result.consolidated) {
    return { consolidated: false, reason: result.reason, goldenPaths: 0, episodesMarked: 0 };
  }
  const gpId = await storeGoldenPath(tx, result, opts);
  const episodeIds = rows.map(r => r.id);
  await markEpisodesConsolidated(tx, episodeIds);
  return {
    consolidated: true,
    goldenPaths: 1,
    goldenPathId: gpId,
    pathLength: result.path.length,
    successRate: result.provenance?.successRate || 0,
    episodesMarked: episodeIds.length,
  };
}

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
  // Decay, pas reset brutal : diviser par deux préserve la trace d'activité
  // récente (LTP/LTD différentielle du cycle suivant) au lieu d'amnésier.
  await tx.run('UPDATE memory_synapses SET activity_history = CAST(activity_history / 2 AS INTEGER)');
}

async function archiveDecisions(tx, doomedIds) {
  // Archive terminale vers le registre fossile AVANT suppression : la prune
  // reste excavable en lecture seule. Passe par fossilizationService pour
  // garder le compteur fossil_strata cohérent avec la table fossils.
  if (doomedIds.length === 0) return 0;
  const placeholders = doomedIds.map(() => '?').join(',');
  let archived = 0;
  try {
    const rows = await tx.all(
      `SELECT id, title, content, category, created_by, organization_id, project_id
         FROM genome_decisions WHERE id IN (${placeholders})`,
      ...doomedIds
    );
    for (const row of rows) {
      try {
        const record = fossilization.buildFossilRecord({
          fossilId: `fossil-pruned-${row.id}`,
          lineageId: row.id,
          reason: 'sleep-cycle pruning (apoptosis)',
          mode: 'trace',
          mineralPayload: { title: row.title, category: row.category, created_by: row.created_by },
          organizationId: row.organization_id || null,
          projectId: row.project_id || null
        });
        await fossilization.persistFossil(tx, record);
        archived += 1;
      } catch (_) {}
    }
  } catch (_) {}
  return archived;
}

async function pruneOrphanedDecisions(tx, opts) {
  const { orphanWeightThreshold, organizationId, projectId } = opts;
  const doomed = await tx.all(`
    SELECT g.id
    FROM genome_decisions g
    LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
    WHERE g.synaptic_weight < ?
      AND (g.category IS NULL OR g.category NOT IN ('core', 'golden_path', 'architecture', 'invariant'))
      AND (g.organization_id = ? OR (g.organization_id IS NULL AND ? IS NULL))
      AND (g.project_id = ? OR (g.project_id IS NULL AND ? IS NULL))
    GROUP BY g.id
    HAVING COUNT(s.source_id) = 0 AND COUNT(s.target_id) = 0
  `, orphanWeightThreshold, organizationId || null, organizationId || null, projectId || null, projectId || null);

  const doomedIds = doomed.map(d => d.id);
  if (doomedIds.length > 0) {
    await archiveDecisions(tx, doomedIds);
    const placeholders = doomedIds.map(() => '?').join(',');
    await tx.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, doomedIds);
  }
  return doomedIds.length;
}

async function pruneTrajectories(tx, trajectoryRetentionDays) {
  try {
    const doomed = await tx.all(`
      SELECT id, status, created_at FROM trajectories
      WHERE is_exceptional = 0
        AND status = 'rejected'
        AND datetime(created_at) < datetime('now', '-' || ? || ' days')
    `, trajectoryRetentionDays);
    if (doomed.length === 0) return 0;
    // Archive vers le fossile avant suppression (best-effort, via le
    // service canonique pour garder fossil_strata cohérent).
    for (const row of doomed) {
      try {
        const record = fossilization.buildFossilRecord({
          fossilId: `fossil-traj-${row.id}`,
          lineageId: String(row.id),
          reason: 'sleep-cycle trajectory pruning',
          mode: 'trace',
          mineralPayload: { status: row.status, created_at: row.created_at }
        });
        await fossilization.persistFossil(tx, record);
      } catch (_) {}
    }
    const placeholders = doomed.map(() => '?').join(',');
    const res = await tx.run(
      `DELETE FROM trajectories WHERE id IN (${placeholders})`,
      doomed.map(r => r.id)
    );
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
    projectId = null,
    enableProceduralConsolidation = true
  } = options;

  try {
    let exosomeStats = { success: true, absorbedCount: 0, engramsStored: 0, plasmidsAssimilated: 0, errors: [] };
    let apoptosisCount = 0;
    let proceduralStats = { consolidated: false, goldenPaths: 0, episodesMarked: 0 };

    await withTransaction(database, async (tx) => {
      await decaySynapticWeights(tx, weightDecayFactor);
      await consolidateSynapses(tx, synapseDecayFactor);
      const prunedSynapses = await pruneDeadSynapses(tx, { minTransmissionWeight, c3Threshold, cd47Threshold });
      await resetActivityHistory(tx);
      apoptosisCount = await pruneOrphanedDecisions(tx, {
        orphanWeightThreshold,
        organizationId: options.organizationId || null,
        projectId: options.projectId || null
      });
      const prunedTrajectories = await pruneTrajectories(tx, trajectoryRetentionDays);
      exosomeStats = await synapticTransmission.absorbExosomes(tx);
      exosomeStats.prunedTrajectories = prunedTrajectories;
      exosomeStats.prunedSynapses = prunedSynapses?.changes || 0;
      if (enableProceduralConsolidation) {
        proceduralStats = await consolidateProceduralMemories(tx, {
          organizationId: options.organizationId || null,
          projectId: options.projectId || null
        });
      }
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
      proceduralConsolidation: {
        consolidated: proceduralStats.consolidated,
        goldenPaths: proceduralStats.goldenPaths || 0,
        episodesMarked: proceduralStats.episodesMarked || 0,
        goldenPathId: proceduralStats.goldenPathId || null,
        pathLength: proceduralStats.pathLength || 0,
        successRate: proceduralStats.successRate || 0,
        reason: proceduralStats.reason || null,
      },
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