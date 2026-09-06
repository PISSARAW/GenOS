/**
 * Lot 2 : Primitives de Mémoire (compile, cherry-pick, search, failures, stdp)
 */
const vectorMemory = require('../vectorMemoryService');
const trajectoryService = require('../trajectoryService');
const episodicMemory = require('../episodicMemoryService');
const telemetry = require('../telemetryObserver');
const epistemics = require('../epistemics');
const { getDatabase, withTransaction } = require('../../db');
const crypto = require('crypto');

async function recordExperience(context = {}) {
  const agentId = context.agentId || context.agent_id || context.orchestratorId || context.orchestrator_id || 'strategy_adapter';
  const sessionId = context.sessionId || context.session_id || context.source_branch || context.branchId || null;
  const taskId = context.taskId || context.task_id || context.task || context.strategy || null;
  const turnNumber = context.turnNumber ?? context.turn_number ?? 0;
  const actionType = context.actionType || context.action_type || context.strategy || 'experience';
  const actionInput = context.actionInput || context.action_input || context.action || context.input || context.context || '';
  const observationOutput = context.observationOutput || context.observation_output || context.observation || context.output || context.outcome || '';
  const rewardScore = typeof context.rewardScore === 'number'
    ? context.rewardScore
    : (typeof context.reward_score === 'number'
      ? context.reward_score
      : (typeof context.successful === 'boolean' ? (context.successful ? 1.0 : 0.0) : 0.5));
  const contextState = context.contextState || context.context_state || context.context || { evidence: context.evidence || [] };

  const episode = await episodicMemory.recordEpisode({
    agentId,
    sessionId,
    taskId,
    turnNumber,
    actionType,
    contextState,
    actionInput,
    observationOutput,
    rewardScore
  });

  telemetry.emitEvent({
    eventType: 'EXPERIENCE_RECORDED',
    agentId,
    action: 'RECORD_EXPERIENCE',
    detail: `Recorded episodic experience ${episode.id} (${actionType}, reward ${rewardScore})`,
    severity: 'info',
    payload: { episodeId: episode.id, taskId, rewardScore, successful: rewardScore >= 0.7 }
  });

  return {
    success: true,
    episodeId: episode.id,
    episode
  };
}

async function compileMemory(context) {
  const db = await getDatabase();
  const facts = context.facts || [];
  const decisions = context.decisions || [];
  const failures = context.failures || [];
  const sourceRefs = context.source_refs || [];
  const agentId = context.agentId || context.orchestratorId || 'strategy_adapter';
  const items = [
    ...facts.map(f => ({ content: f, category: 'Fact' })),
    ...decisions.map(d => ({ content: d, category: 'Decision' })),
    ...failures.map(f => ({ content: '[FAILURE] ' + f, category: 'Failure' }))
  ];
  const ids = [];
  for (const item of items) {
    const id = await vectorMemory.storeMemory(agentId, item.content, null);
    ids.push(id);
  }
  telemetry.emitEvent({
    eventType: 'MEMORY_COMPILED',
    agentId: agentId,
    action: 'COMPILE',
    detail: 'Compiled ' + ids.length + ' memory entries from mission evidence.',
    severity: 'info',
    payload: { count: ids.length, sourceRefs }
  });
  return { success: true, compiledCount: ids.length, memoryIds: ids };
}

async function cherryPickGoldenPath(context) {
  let turns = context.turns || context.trajectory || [];
  if (!Array.isArray(turns) || turns.length === 0) {
    if (context.task || context.reply) {
      turns = [
        { step: 1, action: 'task_definition', classification: 'Exploration', detail: String(context.task || '').slice(0, 200) },
        { step: 2, action: 'task_completion', classification: 'Breakthrough', success: true, detail: String(context.reply || '').slice(0, 200) }
      ];
    } else {
      return { success: false, error: 'At least one trajectory turn is required for a golden path.' };
    }
  }
  const result = vectorMemory.cherryPickGoldenPath(turns);
  const db = await getDatabase();
  const decisionId = 'dec-gp-' + crypto.createHash('sha256').update(JSON.stringify({ agentId: context.agentId || 'strategy_adapter', label: context.label || 'Golden Path', turns })).digest('hex').slice(0, 32);
  const { embed } = require('../embeddingProvider');
  const { textToVector } = require('../memoryScoring');
  const summaryText = `${context.label || 'Golden Path'} ${result.goldenPathSteps.map(s => s.id || s.step || s.action || '').join(' ')}`.trim();
  const vec = (await embed(summaryText)) || textToVector(summaryText);
  const float32 = new Float32Array(vec);
  const buffer = Buffer.from(float32.buffer);
  let trajRecord = null;
  await withTransaction(db, async (tx) => {
    await tx.run(
      'INSERT OR IGNORE INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, embedding_blob) VALUES (?, ?, ?, ?, ?, ?, ?)',
      decisionId,
      context.label || 'Golden Path',
      JSON.stringify(result.goldenPathSteps),
      JSON.stringify(result.goldenPathSteps.map(s => s.id || s.step || s.action)),
      context.agentId || 'strategy_adapter',
      'GoldenPath',
      buffer
    );
    let workspaceId = String(context.workspaceId || '').trim();
    if (!workspaceId) {
      const defaultWs = await tx.get('SELECT id FROM workspaces ORDER BY rowid ASC LIMIT 1');
      workspaceId = defaultWs ? defaultWs.id : 'ws-genos-core';
    }
    trajRecord = await trajectoryService.recordMissionTrajectory(tx, {
      id: context.trajectoryId,
      agentId: context.agentId,
      workspaceId,
      task: context.task,
      report: context.report,
      turns,
      status: context.status
    });
  });

  telemetry.emitEvent({
    eventType: 'GOLDEN_PATH_SYNTHESIZED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'CHERRY_PICK',
    detail: 'Synthesized golden path: ' + result.goldenPathSteps.length + ' steps, ' + result.noiseReductionPercent + '% noise reduction (' + result.prunedStepCount + ' pruned).',
    severity: 'info',
    payload: { ...result, decisionId, trajectoryId: trajRecord?.trajectoryId }
  });
  return { success: true, decisionId, trajectoryId: trajRecord?.trajectoryId, ...result };
}

async function searchMemory(context) {
  const db = await getDatabase();
  const query = context.query || context.task || '';
  const limit = context.limit || 5;
  const results = await vectorMemory.searchMemory(query, { limit }, db);
  const experiences = results.allScoredExperiences || [];
  const validatedExperiences = experiences.map((item) => {
    const epistemic = epistemics.validateMemoryPerception(item);
    return {
      ...item,
      epistemicState: epistemic.state,
      isEpistemicallyValid: !epistemic.isInvalid()
    };
  });
  results.allScoredExperiences = validatedExperiences;
  const found = validatedExperiences.length;
  return { success: found > 0, resultCount: found, results };
}

async function searchFailures(context) {
  const db = await getDatabase();
  const rows = await db.all(
    "SELECT id, title, content, created_at FROM genome_decisions WHERE category = 'Failure' ORDER BY created_at DESC LIMIT ?",
    context.limit || 10
  );
  return { success: true, failureCount: rows.length, failures: rows };
}

async function stdpUpdate(context) {
  const db = await getDatabase();
  let sourceId = context.sourceId || context.causeId;
  let targetId = context.targetId || context.effectId;
  let preSpikeAt = Number(context.preSpikeAt ?? context.preTimestamp);
  let postSpikeAt = Number(context.postSpikeAt ?? context.postTimestamp);
  const tauMs = Number(context.tauMs ?? 20);
  const tauPlus = Number(context.tauPlus ?? tauMs);
  const tauMinus = Number(context.tauMinus ?? tauMs);
  const learningRate = Number(context.learningRate ?? context.delta ?? 1);
  const transmitterType = String(context.transmitterType || 'glutamate').toLowerCase();

  // Auto-detect recent causal pair from agent's trajectory or decisions if omitted in pipeline
  if ((!sourceId || !targetId) && context.agentId) {
    const recent = await db.all(
      `SELECT id, created_at FROM genome_decisions WHERE created_by = ? ORDER BY created_at DESC, rowid DESC LIMIT 2`,
      context.agentId
    );
    if (recent && recent.length >= 2) {
      targetId = recent[0].id;
      sourceId = recent[1].id;
      if (!Number.isFinite(preSpikeAt)) preSpikeAt = new Date(recent[1].created_at).getTime();
      if (!Number.isFinite(postSpikeAt)) postSpikeAt = new Date(recent[0].created_at).getTime();
    }
  }

  if (!sourceId || !targetId || sourceId === targetId) {
    telemetry.emitEvent({
      eventType: 'STDP_SYNAPSE_SKIPPED',
      agentId: context.agentId || 'strategy_adapter',
      action: 'STDP_SKIP',
      detail: 'STDP update skipped: distinct sourceId and targetId not present in context.',
      severity: 'info',
      payload: { agentId: context.agentId }
    });
    return { success: true, skipped: true, reason: 'Distinct sourceId and targetId required for STDP.' };
  }

  if (!Number.isFinite(preSpikeAt) || !Number.isFinite(postSpikeAt) || preSpikeAt === postSpikeAt) {
    if (Number.isFinite(preSpikeAt) && !Number.isFinite(postSpikeAt)) postSpikeAt = preSpikeAt + 10;
    else if (!Number.isFinite(preSpikeAt) && Number.isFinite(postSpikeAt)) preSpikeAt = postSpikeAt - 10;
    else {
      preSpikeAt = Date.now() - 20;
      postSpikeAt = Date.now();
    }
  }
  if (!Number.isFinite(tauMs) || tauMs <= 0 || !Number.isFinite(tauPlus) || tauPlus <= 0 || !Number.isFinite(tauMinus) || tauMinus <= 0 || !Number.isFinite(learningRate) || learningRate <= 0) return { success: false, error: 'Positive STDP time constants and learningRate required.' };
  if (!['glutamate', 'gaba', 'dopamine', 'serotonin'].includes(transmitterType)) return { success: false, error: 'Unsupported transmitterType.' };
  const deltaT = postSpikeAt - preSpikeAt;
  if (deltaT === 0) return { success: false, error: 'preSpikeAt and postSpikeAt must differ for STDP.' };
  let neuromodulationFactor = 1.0;
  if (transmitterType === 'dopamine') {
    const rewardSignal = Number(context.rewardSignal ?? context.reward ?? 1.5);
    neuromodulationFactor = Number.isFinite(rewardSignal) && rewardSignal > 0 ? rewardSignal : 1.5;
  } else if (transmitterType === 'serotonin') {
    neuromodulationFactor = 0.8;
  }

  const baseUpdate = deltaT > 0
    ? learningRate * Math.exp(-Math.abs(deltaT) / tauPlus)
    : -learningRate * Math.exp(-Math.abs(deltaT) / tauMinus);
  const update = Number((baseUpdate * neuromodulationFactor).toFixed(6));

  const [sRow, tRow] = await Promise.all([
    db.get('SELECT id FROM genome_decisions WHERE id = ?', sourceId),
    db.get('SELECT id FROM genome_decisions WHERE id = ?', targetId)
  ]);
  if (!sRow || !tRow) {
    return { success: false, error: `Invalid foreign keys for STDP: sourceId=${sourceId}, targetId=${targetId}` };
  }

  let row;
  await withTransaction(db, async (tx) => {
    const initialWeight = Math.max(0.01, Math.min(20.0, update > 0 ? update : 1.0 + update));
    await tx.run(
      `INSERT INTO memory_synapses
      (source_id, target_id, weight, transmitter_type, pre_spike_at, post_spike_at, delta_t_ms, last_updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_id, target_id) DO UPDATE SET
        weight = MIN(20.0, MAX(0.01, memory_synapses.weight + ?)),
        transmitter_type = COALESCE(memory_synapses.transmitter_type, excluded.transmitter_type),
        pre_spike_at = excluded.pre_spike_at,
        post_spike_at = excluded.post_spike_at,
        delta_t_ms = excluded.delta_t_ms,
        last_updated_at = CURRENT_TIMESTAMP`,
      sourceId, targetId, initialWeight, transmitterType, preSpikeAt, postSpikeAt, deltaT, update
    );
    await tx.run(
      `UPDATE memory_synapses SET
         receptor_density = CASE WHEN ? > 0 THEN MIN(3.0, receptor_density + 0.05) ELSE MAX(0.0, receptor_density - 0.05) END,
         activity_history = activity_history + 1,
         c3_opsonization = CASE WHEN ? > 0 THEN 0.0 ELSE c3_opsonization + 0.1 END,
         cd47_expression = CASE WHEN ? > 0 THEN MIN(2.0, cd47_expression + 0.2) ELSE MAX(0.0, cd47_expression - 0.1) END
       WHERE source_id = ? AND target_id = ?`,
      update, update, update, sourceId, targetId
    );
    row = await tx.get('SELECT weight FROM memory_synapses WHERE source_id = ? AND target_id = ?', sourceId, targetId);
  });
  telemetry.emitEvent({
    eventType: 'STDP_SYNAPSE_UPDATED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'STDP',
    detail: 'Synapse ' + sourceId + ' -> ' + targetId + ' updated to weight ' + (row ? row.weight : (context.delta ?? update)),
    severity: 'info',
    payload: { sourceId, targetId, deltaT, update, transmitterType, newWeight: row ? row.weight : update }
  });
  return { success: true, sourceId, targetId, deltaT, update, transmitterType, newWeight: row ? row.weight : update };
}

module.exports = { recordExperience, compileMemory, cherryPickGoldenPath, searchMemory, searchFailures, stdpUpdate };
