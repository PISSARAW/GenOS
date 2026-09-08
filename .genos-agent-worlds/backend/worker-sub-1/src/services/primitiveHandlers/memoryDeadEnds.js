/**
 * GenOS Cognitive Memory - Negative Knowledge & Dead-End Handlers
 * (searchFailures, avoidKnownDeadEnds, persistDeadEndDecisions)
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const crypto = require('crypto');

function decodeEmbeddingBlob(blob) {
  if (!blob) return [];
  try {
    if (Buffer.isBuffer(blob)) {
      const float32 = new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4));
      return Array.from(float32);
    }
  } catch (_) {}
  return [];
}

async function searchFailures(context = {}) {
  const db = await getDatabase();
  const query = context.query || context.task || '';
  const limit = context.limit || 10;
  const orgFilter = context.organizationId ? ' AND (organization_id = ? OR organization_id IS NULL)' : '';
  const params = context.organizationId ? [context.organizationId] : [];

  if (!query.trim()) {
    const rows = await db.all(
      `SELECT id, title, content, created_at FROM genome_decisions WHERE category = 'Failure'${orgFilter} ORDER BY created_at DESC LIMIT ?`,
      ...params, limit
    );
    return { success: true, failureCount: rows.length, failures: rows };
  }

  const { embed } = require('../embeddingProvider');
  const { textToVector, cosineSimilarity } = require('../memoryScoring');
  let queryVec = null;
  try {
    queryVec = await embed(query);
  } catch (_) {}
  if (!queryVec || queryVec.length !== 768) {
    queryVec = textToVector(query);
  }

  const rows = await db.all(
    `SELECT id, title, content, created_at, embedding_blob FROM genome_decisions WHERE category = 'Failure'${orgFilter} ORDER BY created_at DESC LIMIT 50`,
    ...params
  );

  const scored = rows.map(item => {
    let itemVec = decodeEmbeddingBlob(item.embedding_blob);
    if (!itemVec || itemVec.length !== 768) {
      itemVec = textToVector(`${item.title || ''} ${item.content || ''}`);
    }
    const similarity = cosineSimilarity(queryVec, itemVec);
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      created_at: item.created_at,
      similarity: Number(similarity.toFixed(4))
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  const failures = scored.slice(0, limit);
  return { success: true, failureCount: failures.length, failures };
}

async function avoidKnownDeadEnds(context = {}) {
  const db = await getDatabase();
  const task = context.task || context.mission || '';
  const action = context.action || context.candidate || '';
  const query = context.query || [task, action].filter(Boolean).join(' ') || '';
  const threshold = typeof context.threshold === 'number' ? context.threshold : 0.60;
  const limit = context.limit || 5;

  if (!query.trim()) {
    return {
      success: true,
      isDeadEndRisk: false,
      riskScore: 0,
      matchedFailure: null,
      matchingFailures: [],
      warning: null
    };
  }

  const { embed } = require('../embeddingProvider');
  const { textToVector, cosineSimilarity } = require('../memoryScoring');
  let queryVec = null;
  try {
    queryVec = await embed(query);
  } catch (_) {}
  if (!queryVec || queryVec.length !== 768) {
    queryVec = textToVector(query);
  }

  // 1. Query failure memories from genome_decisions
  const orgFilterDec = context.organizationId ? ' AND (organization_id = ? OR organization_id IS NULL)' : '';
  const decParams = context.organizationId ? [context.organizationId] : [];
  const failureRows = await db.all(
    `SELECT id, title, content, created_at, embedding_blob FROM genome_decisions WHERE category = 'Failure'${orgFilterDec} ORDER BY created_at DESC LIMIT 50`,
    ...decParams
  );

  // 2. Query rejected trajectories
  const orgFilterTraj = context.organizationId ? ' AND (workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?))' : '';
  const trajParams = context.organizationId ? [context.organizationId] : [];
  const rejectedTrajRows = await db.all(
    `SELECT id, title, semantic_summary AS content, created_at, embedding_blob FROM trajectories WHERE status = 'rejected'${orgFilterTraj} ORDER BY created_at DESC LIMIT 50`,
    ...trajParams
  ).catch(() => []);

  const candidates = [...failureRows, ...rejectedTrajRows];
  const scoredFailures = [];

  for (const item of candidates) {
    let itemVec = decodeEmbeddingBlob(item.embedding_blob);
    if (!itemVec || itemVec.length !== 768) {
      itemVec = textToVector(`${item.title || ''} ${item.content || ''}`);
    }
    const sim = cosineSimilarity(queryVec, itemVec);
    scoredFailures.push({
      id: item.id,
      title: item.title,
      content: (item.content || '').slice(0, 300),
      similarity: Number(sim.toFixed(4)),
      createdAt: item.created_at
    });
  }

  scoredFailures.sort((a, b) => b.similarity - a.similarity);
  const matchingFailures = scoredFailures.slice(0, limit);
  const bestMatch = matchingFailures[0] || null;
  const bestScore = bestMatch ? bestMatch.similarity : 0;
  const isDeadEndRisk = bestScore >= threshold;

  telemetry.emitEvent({
    eventType: 'DEAD_END_AVOIDANCE_CHECKED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'AVOID_DEAD_ENDS',
    detail: `Dead-end risk evaluated: ${isDeadEndRisk ? 'RISK DETECTED' : 'CLEAR'} (score: ${bestScore}, threshold: ${threshold})`,
    severity: isDeadEndRisk ? 'warning' : 'info',
    payload: { isDeadEndRisk, bestScore, threshold, matchedFailure: bestMatch }
  });

  return {
    success: true,
    isDeadEndRisk,
    riskScore: bestScore,
    threshold,
    matchedFailure: isDeadEndRisk ? bestMatch : null,
    matchingFailures,
    warning: isDeadEndRisk
      ? `Action or task closely resembles known dead end (${(bestScore * 100).toFixed(1)}% match): "${bestMatch.title || bestMatch.content}". Recommended avoidance.`
      : null
  };
}

async function persistDeadEndDecisions(db, deadEndSteps = [], options = {}) {
  if (!Array.isArray(deadEndSteps) || deadEndSteps.length === 0) return [];
  const { embed } = require('../embeddingProvider');
  const { textToVector } = require('../memoryScoring');
  const insertedIds = [];

  for (const deadEnd of deadEndSteps) {
    const detail = deadEnd.detail || deadEnd.error || deadEnd.action || 'Pruned trajectory dead-end';
    const deadEndId = 'dec-fail-' + crypto.createHash('sha256').update(JSON.stringify({
      agentId: options.agentId || options.createdBy || 'strategy_adapter',
      detail,
      step: deadEnd.step,
      time: Date.now(),
      rand: Math.random()
    })).digest('hex').slice(0, 32);

    const title = `Dead-End: ${String(deadEnd.action || deadEnd.step || 'Step').slice(0, 30)} - ${String(detail).slice(0, 60)}`;
    const content = JSON.stringify(deadEnd);
    let vec = null;
    try {
      vec = await embed(detail);
    } catch (_) {}
    if (!vec || vec.length !== 768) {
      vec = textToVector(detail);
    }
    const float32 = new Float32Array(vec);
    const buffer = Buffer.from(float32.buffer);

    await db.run(
      'INSERT OR IGNORE INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, embedding_blob, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      deadEndId,
      title,
      content,
      JSON.stringify([deadEnd.id || deadEnd.step || 'dead_end']),
      options.agentId || options.createdBy || 'strategy_adapter',
      'Failure',
      buffer,
      options.organizationId || null,
      options.projectId || null
    );
    insertedIds.push(deadEndId);
  }
  return insertedIds;
}

module.exports = {
  decodeEmbeddingBlob,
  searchFailures,
  avoidKnownDeadEnds,
  persistDeadEndDecisions
};
