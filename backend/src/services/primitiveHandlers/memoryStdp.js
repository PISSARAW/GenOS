/**
 * Lot 2 : Primitive STDP (mise a jour synaptique) et utilitaires de resolution.
 */
const telemetry = require('../telemetryObserver');
const { getDatabase, withTransaction } = require('../../db');

function firstTruthy(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return values[values.length - 1];
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value != null) return value;
  }
  return values[values.length - 1];
}

async function detectCausalPair(db, context, ids) {
  if ((ids.sourceId && ids.targetId) || !context.agentId) {
    return ids;
  }
  const recent = await db.all(
    `SELECT id, created_at FROM genome_decisions WHERE created_by = ? ORDER BY created_at DESC, rowid DESC LIMIT 2`,
    context.agentId
  );
  if (recent && recent.length >= 2) {
    ids.targetId = recent[0].id;
    ids.sourceId = recent[1].id;
    if (!Number.isFinite(ids.preSpikeAt)) ids.preSpikeAt = new Date(recent[1].created_at).getTime();
    if (!Number.isFinite(ids.postSpikeAt)) ids.postSpikeAt = new Date(recent[0].created_at).getTime();
  }
  return ids;
}

function buildSkipResult(context, ids) {
  if (ids.sourceId && ids.targetId && ids.sourceId !== ids.targetId) {
    return null;
  }
  telemetry.emitEvent({
    eventType: 'STDP_SYNAPSE_SKIPPED',
    agentId: firstTruthy(context.agentId, 'strategy_adapter'),
    action: 'STDP_SKIP',
    detail: 'STDP update skipped: distinct sourceId and targetId not present in context.',
    severity: 'info',
    payload: { agentId: context.agentId }
  });
  return { success: false, skipped: true, status: 'skipped', reason: 'Distinct sourceId and targetId required for STDP.' };
}

function normalizeSpikeTimes(preSpikeAt, postSpikeAt) {
  if (!Number.isFinite(preSpikeAt) || !Number.isFinite(postSpikeAt) || preSpikeAt === postSpikeAt) {
    if (Number.isFinite(preSpikeAt) && !Number.isFinite(postSpikeAt)) {
      postSpikeAt = preSpikeAt + 10;
    } else if (!Number.isFinite(preSpikeAt) && Number.isFinite(postSpikeAt)) {
      preSpikeAt = postSpikeAt - 10;
    } else {
      preSpikeAt = Date.now() - 20;
      postSpikeAt = Date.now();
    }
  }
  return { preSpikeAt, postSpikeAt };
}

function validateStdpTimeConstants(params) {
  const { tauMs, tauPlus, tauMinus, learningRate } = params;
  if (!Number.isFinite(tauMs) || tauMs <= 0 || !Number.isFinite(tauPlus) || tauPlus <= 0
    || !Number.isFinite(tauMinus) || tauMinus <= 0 || !Number.isFinite(learningRate) || learningRate <= 0) {
    return 'Positive STDP time constants and learningRate required.';
  }
  return null;
}

function validateTransmitterType(transmitterType) {
  if (!['glutamate', 'gaba', 'dopamine', 'serotonin'].includes(transmitterType)) {
    return 'Unsupported transmitterType.';
  }
  return null;
}

function resolveNeuromodulationFactor(transmitterType, context) {
  if (transmitterType === 'dopamine') {
    const rewardSignal = Number(firstNonNull(context.rewardSignal, context.reward, 1.5));
    return Number.isFinite(rewardSignal) && rewardSignal > 0 ? rewardSignal : 1.5;
  }
  if (transmitterType === 'serotonin') {
    return 0.8;
  }
  return 1.0;
}

function computeStdpUpdate(params) {
  const { learningRate, deltaT, tauPlus, tauMinus, neuromodulationFactor } = params;
  const baseUpdate = deltaT > 0
    ? learningRate * Math.exp(-Math.abs(deltaT) / tauPlus)
    : -learningRate * Math.exp(-Math.abs(deltaT) / tauMinus);
  return Number((baseUpdate * neuromodulationFactor).toFixed(6));
}

async function ensureDecisionRow(db, payload) {
  const { id, row, context } = payload;
  if (row) {
    return row;
  }
  await db.run(
    'INSERT OR IGNORE INTO genome_decisions (id, title, content, created_by, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?)',
    id, `Decision ${id}`, `Synthetic decision ${id}`, firstTruthy(context.agentId, 'system'), firstTruthy(context.organizationId, null), firstTruthy(context.projectId, null)
  );
  return db.get('SELECT id, organization_id, project_id FROM genome_decisions WHERE id = ?', id);
}

function validateStdpTenant(context, sourceRow, targetRow) {
  if (sourceRow.organization_id !== targetRow.organization_id || sourceRow.project_id !== targetRow.project_id) {
    return 'STDP source and target memories must belong to the same tenant.';
  }
  if ((context.organizationId && context.organizationId !== sourceRow.organization_id)
    || (context.projectId && context.projectId !== sourceRow.project_id)) {
    return 'STDP memories are outside the requested tenant.';
  }
  return null;
}

function resolveSynapseWeight(row, fallback) {
  return row ? row.weight : fallback;
}

async function stdpUpdate(context) {
  const db = await getDatabase();
  const ids = {
    sourceId: firstTruthy(context.sourceId, context.causeId),
    targetId: firstTruthy(context.targetId, context.effectId),
    preSpikeAt: Number(firstNonNull(context.preSpikeAt, context.preTimestamp)),
    postSpikeAt: Number(firstNonNull(context.postSpikeAt, context.postTimestamp))
  };
  const tauMs = Number(firstNonNull(context.tauMs, 20));
  const tauPlus = Number(firstNonNull(context.tauPlus, tauMs));
  const tauMinus = Number(firstNonNull(context.tauMinus, tauMs));
  const learningRate = Number(firstNonNull(context.learningRate, context.delta, 1));
  const transmitterType = String(firstTruthy(context.transmitterType, 'glutamate')).toLowerCase();

  await detectCausalPair(db, context, ids);

  const skipResult = buildSkipResult(context, ids);
  if (skipResult) {
    return skipResult;
  }

  const times = normalizeSpikeTimes(ids.preSpikeAt, ids.postSpikeAt);
  const preSpikeAt = times.preSpikeAt;
  const postSpikeAt = times.postSpikeAt;

  const timeError = validateStdpTimeConstants({ tauMs, tauPlus, tauMinus, learningRate });
  if (timeError) {
    return { success: false, error: timeError };
  }
  const transmitterError = validateTransmitterType(transmitterType);
  if (transmitterError) {
    return { success: false, error: transmitterError };
  }

  const deltaT = postSpikeAt - preSpikeAt;
  if (deltaT === 0) {
    return { success: false, error: 'preSpikeAt and postSpikeAt must differ for STDP.' };
  }

  const neuromodulationFactor = resolveNeuromodulationFactor(transmitterType, context);
  const update = computeStdpUpdate({ learningRate, deltaT, tauPlus, tauMinus, neuromodulationFactor });

  const [sourceInitial, targetInitial] = await Promise.all([
    db.get('SELECT id, organization_id, project_id FROM genome_decisions WHERE id = ?', ids.sourceId),
    db.get('SELECT id, organization_id, project_id FROM genome_decisions WHERE id = ?', ids.targetId)
  ]);
  const sRow = await ensureDecisionRow(db, { id: ids.sourceId, row: sourceInitial, context });
  const tRow = await ensureDecisionRow(db, { id: ids.targetId, row: targetInitial, context });
  if (!sRow || !tRow) {
    return { success: false, error: `Invalid foreign keys for STDP: sourceId=${ids.sourceId}, targetId=${ids.targetId}` };
  }
  const orgId = firstTruthy(context.organizationId, sRow.organization_id, null);
  const projId = firstTruthy(context.projectId, sRow.project_id, null);
  const tenantError = validateStdpTenant(context, sRow, tRow);
  if (tenantError) {
    return { success: false, error: tenantError };
  }

  let row;
  await withTransaction(db, async (tx) => {
    const initialWeight = Math.max(0.01, Math.min(20.0, update > 0 ? update : 1.0 + update));
    await tx.run(
      `INSERT INTO memory_synapses
      (source_id, target_id, weight, transmitter_type, pre_spike_at, post_spike_at, delta_t_ms, organization_id, project_id, last_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_id, target_id) DO UPDATE SET
        weight = MIN(20.0, MAX(0.01, memory_synapses.weight + ?)),
        transmitter_type = COALESCE(memory_synapses.transmitter_type, excluded.transmitter_type),
        pre_spike_at = excluded.pre_spike_at,
        post_spike_at = excluded.post_spike_at,
        delta_t_ms = excluded.delta_t_ms,
        organization_id = COALESCE(memory_synapses.organization_id, excluded.organization_id),
        project_id = COALESCE(memory_synapses.project_id, excluded.project_id),
        last_updated_at = CURRENT_TIMESTAMP`,
      ids.sourceId, ids.targetId, initialWeight, transmitterType, preSpikeAt, postSpikeAt, deltaT, orgId, projId, update
    );
    await tx.run(
      `UPDATE memory_synapses SET
         receptor_density = CASE WHEN ? > 0 THEN MIN(3.0, receptor_density + 0.05) ELSE MAX(0.0, receptor_density - 0.05) END,
         activity_history = activity_history + 1,
         c3_opsonization = CASE WHEN ? > 0 THEN 0.0 ELSE c3_opsonization + 0.1 END,
         cd47_expression = CASE WHEN ? > 0 THEN MIN(2.0, cd47_expression + 0.2) ELSE MAX(0.0, cd47_expression - 0.1) END
       WHERE source_id = ? AND target_id = ?`,
      update, update, update, ids.sourceId, ids.targetId
    );
    row = await tx.get('SELECT weight FROM memory_synapses WHERE source_id = ? AND target_id = ?', ids.sourceId, ids.targetId);
  });

  const newWeight = resolveSynapseWeight(row, update);
  telemetry.emitEvent({
    eventType: 'STDP_SYNAPSE_UPDATED',
    agentId: firstTruthy(context.agentId, 'strategy_adapter'),
    action: 'STDP',
    detail: 'Synapse ' + ids.sourceId + ' -> ' + ids.targetId + ' updated to weight ' + resolveSynapseWeight(row, firstNonNull(context.delta, update)),
    severity: 'info',
    payload: { sourceId: ids.sourceId, targetId: ids.targetId, deltaT, update, transmitterType, newWeight }
  });
  return { success: true, sourceId: ids.sourceId, targetId: ids.targetId, deltaT, update, transmitterType, newWeight };
}

module.exports = { stdpUpdate, firstTruthy, firstNonNull };
