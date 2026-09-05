/**
 * Lot 2 : Primitives de Mémoire (compile, cherry-pick, search, failures, stdp)
 */
const vectorMemory = require('../vectorMemoryService');
const trajectoryService = require('../trajectoryService');
const telemetry = require('../telemetryObserver');
const epistemics = require('../epistemics');
const { getDatabase } = require('../../db');

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
  const turns = context.turns || context.trajectory || [];
  const result = vectorMemory.cherryPickGoldenPath(turns);
  const db = await getDatabase();
  const decisionId = 'dec-gp-' + Date.now();
  const float32 = new Float32Array(new Array(768).fill(0.0));
  const buffer = Buffer.from(float32.buffer);
  await db.run(
    'INSERT INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, embedding_blob) VALUES (?, ?, ?, ?, ?, ?, ?)',
    decisionId,
    context.label || 'Golden Path',
    JSON.stringify(result.goldenPathSteps),
    JSON.stringify(result.goldenPathSteps.map(s => s.id || s.step || s.action)),
    context.agentId || 'strategy_adapter',
    'GoldenPath',
    buffer
  );

  let trajRecord = null;
  try {
    trajRecord = await trajectoryService.recordMissionTrajectory(db, {
      id: context.trajectoryId,
      agentId: context.agentId,
      workspaceId: context.workspaceId,
      task: context.task,
      report: context.report,
      turns,
      status: context.status
    });
  } catch (err) {
    console.error('Erreur enregistrement trajectoire:', err.message);
  }

  telemetry.emitEvent({
    eventType: 'GOLDEN_PATH_SYNTHESIZED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'CHERRY_PICK',
    detail: 'Synthesized golden path: ' + result.prunedStepCount + ' steps, ' + result.noiseReductionPercent + '% noise reduction.',
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
  const delta = Number.isFinite(context.delta) ? context.delta : 1.0;

  if (!sourceId) {
    const recentDecision = await db.get(
      "SELECT id FROM genome_decisions WHERE created_by = ? OR category IN ('Experience', 'Decision') ORDER BY created_at DESC LIMIT 1",
      context.agentId || context.orchestratorId || ''
    );
    sourceId = recentDecision ? recentDecision.id : null;
  }
  if (!targetId) {
    const recentGolden = await db.get(
      "SELECT id FROM genome_decisions WHERE category = 'GoldenPath' ORDER BY created_at DESC LIMIT 1"
    );
    targetId = recentGolden ? recentGolden.id : null;
  }

  if (!sourceId || !targetId || sourceId === targetId) {
    const agentNode = `node_cause_${context.agentId || 'agent'}`;
    const targetNode = `node_effect_${Date.now()}`;
    const float32 = new Float32Array(768);
    const buf = Buffer.from(float32.buffer);
    await db.run("INSERT OR IGNORE INTO genome_decisions (id, title, content, created_by, category, embedding_blob) VALUES (?, ?, ?, ?, 'ConnectomeNode', ?)",
      agentNode, 'Synaptic Cause Node', `Agent root ${context.agentId}`, context.agentId || 'stdp', buf);
    await db.run("INSERT OR IGNORE INTO genome_decisions (id, title, content, created_by, category, embedding_blob) VALUES (?, ?, ?, ?, 'ConnectomeNode', ?)",
      targetNode, 'Synaptic Effect Node', `Outcome for ${context.task || 'mission'}`, context.agentId || 'stdp', buf);
    sourceId = sourceId || agentNode;
    targetId = targetId || targetNode;
    if (sourceId === targetId) targetId = targetNode;
  }

  const [sRow, tRow] = await Promise.all([
    db.get('SELECT id FROM genome_decisions WHERE id = ?', sourceId),
    db.get('SELECT id FROM genome_decisions WHERE id = ?', targetId)
  ]);
  if (!sRow || !tRow) {
    return { success: false, error: `Invalid foreign keys for STDP: sourceId=${sourceId}, targetId=${targetId}` };
  }

  await db.run(
    'INSERT INTO memory_synapses (source_id, target_id, weight) VALUES (?, ?, ?) ON CONFLICT(source_id, target_id) DO UPDATE SET weight = MIN(20.0, MAX(-20.0, weight + ?))',
    sourceId, targetId, delta, delta
  );
  const row = await db.get('SELECT weight FROM memory_synapses WHERE source_id = ? AND target_id = ?', sourceId, targetId);
  telemetry.emitEvent({
    eventType: 'STDP_SYNAPSE_UPDATED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'STDP',
    detail: 'Synapse ' + sourceId + ' -> ' + targetId + ' updated to weight ' + (row ? row.weight : delta),
    severity: 'info',
    payload: { sourceId, targetId, newWeight: row ? row.weight : delta }
  });
  return { success: true, sourceId, targetId, newWeight: row ? row.weight : delta };
}

module.exports = { compileMemory, cherryPickGoldenPath, searchMemory, searchFailures, stdpUpdate };
