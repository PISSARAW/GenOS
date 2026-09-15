'use strict';

/**
 * @file structuralPlasticity.js
 * @description 5 primitives de plasticité structurelle :
 *   stdp_update, causal_weighting, infer_traits, replicate, promote_trait.
 *
 * Ces primitives alimentent les stratégies déclarées dans
 * backend/src/strategies/families/knowledgeResilienceStrategies.js :
 *   - stdp_plasticity       → [stdp_update, causal_weighting]
 *   - controlled_lamarckian → [infer_traits, replicate, promote_trait]
 *
 * État : Map module-level, perdu au redémarrage (documenté).
 */

const telemetry = require('../telemetryObserver');
const { getDatabase, withTransaction } = require('../../db');
const { firstTruthy, firstNonNull } = require('./searchHelpers');
// ── Maps module-level (perdu au redémarrage) ─────────────────────────────────

/** Dernières observations STDP par paire source→target. */
const stdpHistory = new Map();

/** Traits appris et promus par contexte. */
const learnedTraits = new Map();
// ── STDP update ───────────────────────────────────────────────────────────────

async function stdpUpdate(context = {}) {
  const db = await getDatabase();
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'strategy_adapter');
  const sourceId = firstTruthy(context.sourceId, context.source_id, context.causeId, context.from);
  const targetId = firstTruthy(context.targetId, context.target_id, context.effectId, context.to);
  const success = context.success;

  if (!sourceId || !targetId) {
    return { success: false, error: 'sourceId et targetId requis pour STDP.' };
  }

  const timing = resolveStdpTiming(context);
  const existing = upsertStdpHistory({ sourceId, targetId, deltaT: timing.deltaT, success });
  const params = resolveStdpParams(context, existing);
  const weightChange = computeStdpWeightChange(timing.deltaT, params);
  const newWeight = applySuccessModulation(weightChange, success, params.baseWeight);

  const synapticRow = await db.get(
    `SELECT id, weight FROM memory_synapses WHERE source_id = ? AND target_id = ?`,
    sourceId, targetId
  );

  if (synapticRow) {
    await db.run(
      `UPDATE memory_synapses SET weight = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      newWeight, synapticRow.id
    );
  } else {
    await db.run(
      `INSERT OR IGNORE INTO memory_synapses (source_id, target_id, weight, transmitter_type, pre_spike_at, post_spike_at, delta_t_ms, organization_id, project_id, last_updated_at)
       VALUES (?, ?, ?, 'glutamate', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      sourceId, targetId, newWeight, timing.preSpikeAt, timing.postSpikeAt, timing.deltaT,
      firstTruthy(context.organizationId, null),
      firstTruthy(context.projectId, null)
    );
  }

  telemetry.emitEvent({
    eventType: 'STDP_UPDATE',
    agentId,
    action: 'stdp_update',
    detail: `STDP update: ${sourceId} → ${targetId}, deltaT=${timing.deltaT}ms, Δweight=${Number(weightChange).toFixed(4)}, newWeight=${Number(newWeight).toFixed(4)}`,
    severity: 'info',
    payload: { sourceId, targetId, deltaT: timing.deltaT, weightChange: Number(weightChange), newWeight: Number(newWeight), success }
  });

  return {
    success: true,
    source_id: sourceId,
    target_id: targetId,
    delta_t_ms: timing.deltaT,
    weight_change: Number(weightChange),
    new_weight: Number(newWeight),
    success,
    reason: `Poids mis à jour via STDP (${timing.deltaT > 0 ? 'LTP' : 'LTD'}).`
  };
}

function resolveStdpTiming(context) {
  const preSpikeAt = Number(context.preSpikeAt || context.preTimestamp || Date.now() - 20);
  const postSpikeAt = Number(context.postSpikeAt || context.postTimestamp || Date.now());
  return { preSpikeAt, postSpikeAt, deltaT: postSpikeAt - preSpikeAt };
}
function upsertStdpHistory(record) {
  const { sourceId, targetId, deltaT, success } = record;
  const key = `${sourceId}::${targetId}`;
  const existing = stdpHistory.get(key);
  const updated = { sourceId, targetId, lastDeltaT: deltaT, lastSuccess: success, updatedAt: new Date().toISOString() };
  stdpHistory.set(key, updated);
  return { ...existing, ...updated };
}

function resolveStdpParams(context, existing) {
  return {
    tauPlus: Number(context.tauPlus || 20),
    tauMinus: Number(context.tauMinus || 20),
    learningRate: Number(context.learningRate || 0.01),
    baseWeight: Number(existing?.weight || context.baseWeight || 1.0)
  };
}

function computeStdpWeightChange(deltaT, params) {
  if (deltaT > 0) {
    return params.learningRate * Math.exp(-deltaT / params.tauPlus);
  }
  return -params.learningRate * Math.exp(deltaT / params.tauMinus);
}
function applySuccessModulation(weightChange, success, baseWeight) {
  const modulated = success === false ? weightChange * 0.5 : weightChange;
  return Math.max(0.01, Math.min(10.0, baseWeight + modulated));
}
// ── Causal weighting ──────────────────────────────────────────────────────────

async function causalWeighting(context = {}) {
  const db = await getDatabase();
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'strategy_adapter');
  const minCausalStrength = Number(context.minCausalStrength || context.threshold || 0.1);

  const rows = await db.all(
    `SELECT source_id, target_id, weight, transmitter_type, activity_history
     FROM memory_synapses
     WHERE (organization_id = ? OR ? IS NULL)
       AND (project_id = ? OR ? IS NULL)
     ORDER BY last_updated_at DESC`,
    firstTruthy(context.organizationId, null),
    context.organizationId || null,
    firstTruthy(context.projectId, null),
    context.projectId || null
  );

  if (!rows || rows.length === 0) {
    return { success: true, weighted: 0, reason: 'Aucune synapse à pondérer.' };
  }

  const now = Date.now();
  const weighted = [];

  for (const row of rows) {
    const activityFactor = Math.min(1, (row.activity_history || 0) / 20);
    const baseCausal = Math.max(0.1, Number(row.weight || 1.0) / 10.0);
    const causalStrength = Math.min(1.0, baseCausal * (0.5 + activityFactor * 0.5));

    await db.run(
      `UPDATE memory_synapses
       SET causal_strength = ?, last_causal_at = ?
       WHERE source_id = ? AND target_id = ?`,
      causalStrength, now, row.source_id, row.target_id
    );

    weighted.push({
      source_id: row.source_id,
      target_id: row.target_id,
      original_weight: row.weight,
      causal_strength: causalStrength,
      activity_factor: Number(activityFactor.toFixed(3))
    });
  }

  telemetry.emitEvent({
    eventType: 'CAUSAL_WEIGHTING_COMPLETE',
    agentId,
    action: 'causal_weighting',
    detail: `Pondération causale appliquée à ${weighted.length} synapses.`,
    severity: 'info',
    payload: { weightedCount: weighted.length, minCausalStrength }
  });

  return {
    success: true,
    weighted: weighted.length,
    synapses: weighted.slice(0, 50),
    reason: `Pondération causale appliquée à ${weighted.length} connexions.`
  };
}
// ── Trait helpers ─────────────────────────────────────────────────────────────

function traitFingerprint(name, sourceId, description) {
  const payload = JSON.stringify({ name, source: sourceId, description: description ? description.slice(0, 100) : '' });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
  }
  return 'trait_' + Math.abs(hash).toString(36);
}

async function loadTraitOrFail(db, traitId, learnedTraits) {
  let trait = learnedTraits.get(traitId);
  if (trait) return trait;
  const row = await db.get('SELECT * FROM learned_traits WHERE id = ?', traitId);
  if (!row) return null;
  trait = {
    trait_id: row.id, trait_name: row.trait_name, description: row.trait_description,
    source_agent_id: row.source_agent_id, confidence: row.confidence,
    usage_count: row.usage_count, promotion_level: row.promotion_level,
    created_at: row.created_at, last_seen: row.updated_at,
    tags: []
  };
  learnedTraits.set(traitId, trait);
  return trait;
}
// ── Infer traits ──────────────────────────────────────────────────────────────

async function inferTraits(context = {}) {
  const db = await getDatabase();
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'strategy_adapter');
  const executionId = firstTruthy(context.executionId, context.execution_id, context.sessionId, context.session_id);
  const successThreshold = Number(context.successThreshold || context.minReward || 0.5);

  if (!executionId) {
    return { success: false, error: 'executionId ou sessionId requis pour inférer des traits.' };
  }

  const episode = await db.get(
    `SELECT * FROM episodic_memories WHERE id = ? OR session_id = ? ORDER BY created_at DESC LIMIT 1`,
    executionId, executionId
  );

  if (!episode || (episode.reward_score != null && episode.reward_score < successThreshold)) {
    return {
      success: false,
      error: `Exécution non réussie ou introuvable (reward=${episode ? episode.reward_score : 'N/A'}, seuil=${successThreshold}).`
    };
  }

  const traitName = firstTruthy(context.traitName, context.name, context.trait, `trait_${agentId}_${Date.now()}`);
  const description = firstTruthy(context.description, context.reason, `Trait inféré de l'exécution ${executionId}`);
  const traitId = traitFingerprint(traitName, agentId, description);

  const existing = learnedTraits.get(traitId);
  if (existing) {
    existing.usage_count = (existing.usage_count || 0) + 1;
    existing.last_seen = new Date().toISOString();
    learnedTraits.set(traitId, existing);
    return { success: true, trait_id: traitId, trait_name: traitName, inferred: false, reason: `Trait "${traitName}" déjà connu, utilisation incrémentée.` };
  }

  const newTrait = {
    trait_id: traitId, trait_name: traitName, description,
    source_agent_id: agentId, source_execution_id: executionId,
    confidence: 0.7, usage_count: 1, promotion_level: 0,
    created_at: new Date().toISOString(), last_seen: new Date().toISOString(),
    tags: (context.tags || []).concat(['inféré'])
  };

  learnedTraits.set(traitId, newTrait);

  await db.run(
    `INSERT OR REPLACE INTO learned_traits (id, trait_name, trait_description, source_agent_id, context_id, trait_data_json, promotion_level, confidence, usage_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    traitId, traitName, description, agentId, executionId,
    JSON.stringify({ executionId, tags: newTrait.tags }),
    0, 0.7, 1, newTrait.created_at
  );

  telemetry.emitEvent({
    eventType: 'TRAIT_INFERRED', agentId, action: 'infer_traits',
    detail: `Trait "${traitName}" inféré de l'exécution ${executionId}.`,
    severity: 'info', payload: { traitId, traitName, executionId }
  });

  return { success: true, trait_id: traitId, trait_name: traitName, confidence: 0.7, inferred: true, reason: `Trait "${traitName}" extrait de l'exécution réussie ${executionId}.` };
}
// ── Replicate helpers ──────────────────────────────────────────────────────────

function resolveTargets(context) {
  const targetAgentIds = Array.isArray(context.targetAgents) ? context.targetAgents
    : Array.isArray(context.targets) ? context.targets
    : (context.targetAgent ? [context.targetAgent] : []);
  const targetContextId = firstTruthy(context.targetContext, context.context_id, context.sessionId);
  return { targetAgentIds, targetContextId };
}

function buildTargets(targetAgentIds, targetContextId) {
  if (targetAgentIds.length === 0 && !targetContextId) return [];
  if (targetContextId) {
    return [{ type: 'context', id: targetContextId }]
      .concat(targetAgentIds.map(id => ({ type: 'agent', id })));
  }
  return targetAgentIds.map(id => ({ type: 'agent', id }));
}

function createReplica(source, sourceTraitId, target) {
  const replicatedId = traitFingerprint(source.trait_name, target.id, source.description);
  return {
    trait_id: replicatedId,
    trait_name: source.trait_name,
    description: source.description,
    source_agent_id: source.source_agent_id,
    source_trait_id: sourceTraitId,
    target_id: target.id,
    target_type: target.type,
    confidence: Math.min(1.0, (source.confidence || 0.5) * 0.9),
    usage_count: 0,
    promotion_level: source.promotion_level,
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    tags: (source.tags || []).concat(['répliqué']),
    replicatedId
  };
}

function persistReplica(db, replica) {
  return db.run(
    `INSERT OR REPLACE INTO learned_traits (id, trait_name, trait_description, source_agent_id, context_id, trait_data_json, promotion_level, confidence, usage_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    replica.replicatedId, replica.trait_name, replica.description,
    replica.source_agent_id, replica.target_id,
    JSON.stringify({ sourceTraitId: replica.source_trait_id, targetId: replica.target_id, targetType: replica.target_type }),
    replica.promotion_level, replica.confidence, 0,
    replica.created_at
  );
}
// ── Replicate ─────────────────────────────────────────────────────────────────

async function replicate(context = {}) {
  const db = await getDatabase();
  const sourceTraitId = firstTruthy(context.traitId, context.trait_id, context.id);

  if (!sourceTraitId) return { success: false, error: 'traitId requis pour la réplication.' };

  const { targetAgentIds, targetContextId } = resolveTargets(context);
  if (targetAgentIds.length === 0 && !targetContextId) return { success: false, error: 'targetAgents ou targetContext requis.' };

  const source = await loadTraitOrFail(db, sourceTraitId, learnedTraits);
  if (!source) return { success: false, error: `Trait "${sourceTraitId}" introuvable.` };

  const targets = buildTargets(targetAgentIds, targetContextId);
  const replicated = [];

  for (const target of targets) {
    const replica = createReplica(source, sourceTraitId, target);
    learnedTraits.set(replica.replicatedId, replica);
    await persistReplica(db, replica);
    replicated.push({ target: target.id, target_type: target.type, trait_id: replica.replicatedId });
  }

  telemetry.emitEvent({
    eventType: 'TRAIT_REPLICATED', agentId: source.source_agent_id, action: 'replicate',
    detail: `Trait "${source.trait_name}" répliqué vers ${replicated.length} cible(s).`,
    severity: 'info', payload: { sourceTraitId, replicatedCount: replicated.length }
  });

  return { success: true, source_trait_id: sourceTraitId, source_trait_name: source.trait_name, replicated: replicated.length, targets: replicated, reason: `Trait "${source.trait_name}" répliqué vers ${replicated.length} cible(s).` };
}
// ── Promote trait ─────────────────────────────────────────────────────────────

async function promoteTrait(context = {}) {
  const db = await getDatabase();
  const traitId = firstTruthy(context.traitId, context.trait_id, context.id);
  const targetLevel = Number(context.promotionLevel || context.level || context.targetLevel || 1);
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'strategy_adapter');

  if (!traitId) return { success: false, error: 'traitId requis pour la promotion.' };
  if (![0, 1, 2].includes(targetLevel)) return { success: false, error: 'promotionLevel doit être 0 (agent), 1 (stratégie) ou 2 (organisation).' };

  const trait = await loadTraitOrFail(db, traitId, learnedTraits);
  if (!trait) return { success: false, error: `Trait "${traitId}" introuvable.` };

  if (trait.promotion_level >= targetLevel) {
    return {
      success: true, trait_id: traitId, trait_name: trait.trait_name, already_promoted: true,
      current_level: trait.promotion_level, target_level: targetLevel,
      reason: `Trait "${trait.trait_name}" déjà au niveau ${trait.promotion_level} (cible: ${targetLevel}).`
    };
  }

  trait.promotion_level = targetLevel;
  trait.last_promoted = new Date().toISOString();
  trait.tags = (trait.tags || []).concat(['promu_niveau_' + targetLevel]);
  learnedTraits.set(traitId, trait);

  const levelLabel = ['agent', 'stratégie', 'organisation'][targetLevel] || 'inconnu';
  await db.run(`UPDATE learned_traits SET promotion_level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, targetLevel, traitId);

  telemetry.emitEvent({
    eventType: 'TRAIT_PROMOTED', agentId, action: 'promote_trait',
    detail: `Trait "${trait.trait_name}" promu au niveau ${levelLabel} (${targetLevel}).`,
    severity: 'info', payload: { traitId, traitName: trait.trait_name, fromLevel: trait.promotion_level, toLevel: targetLevel }
  });

  return {
    success: true, trait_id: traitId, trait_name: trait.trait_name,
    from_level: trait.promotion_level, to_level: targetLevel, level_label: levelLabel, promoted: true,
    reason: `Trait "${trait.trait_name}" promu du niveau ${trait.promotion_level} au niveau ${levelLabel} (${targetLevel}).`
  };
}

module.exports = { stdpUpdate, causalWeighting, inferTraits, replicate, promoteTrait, learnedTraits };
