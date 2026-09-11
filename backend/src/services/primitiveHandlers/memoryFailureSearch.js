/**
 * GenOS failure-memory search building blocks.
 * Extracted from primitiveHandlers/memoryDeadEnds.js so the orchestrator
 * stays inside the complexity gate. Every function is dependency-light on
 * purpose: embedding/scoring modules are required lazily, mirroring the
 * original call sites.
 */

function decodeEmbeddingBlob(blob) {
  if (!blob) return [];
  try {
    if (Buffer.isBuffer(blob)) {
      const float32 = new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4));
      for (let i = 0; i < float32.length; i++) {
        if (float32[i] !== 0) return Array.from(float32);
      }
      return [];
    }
  } catch (_) {
    return [];
  }
  return [];
}

function buildQueryText(context) {
  if (context.query) return context.query;
  const task = context.task || context.mission || '';
  const action = context.action || context.candidate || '';
  if (task) {
    if (action) return task + ' ' + action;
    return task;
  }
  return action;
}

async function resolveQueryVector(query) {
  const provider = require('../embeddingProvider');
  const scoring = require('../memoryScoring');
  let queryVec = null;
  try {
    queryVec = await provider.embed(query);
  } catch (_) {
    queryVec = null;
  }
  if (!queryVec) return scoring.textToVector(query);
  if (queryVec.length !== 768) return scoring.textToVector(query);
  return queryVec;
}

async function fetchDecisionFailures(db, organizationId, limit) {
  if (!organizationId) {
    return db.all('SELECT id, title, content, created_at, embedding_blob FROM genome_decisions WHERE category = \'Failure\' ORDER BY created_at DESC LIMIT ?', limit);
  }
  return db.all('SELECT id, title, content, created_at, embedding_blob FROM genome_decisions WHERE category = \'Failure\' AND (organization_id = ? OR organization_id IS NULL) ORDER BY created_at DESC LIMIT ?', organizationId, limit);
}

async function fetchRejectedTrajectories(db, organizationId) {
  try {
    if (!organizationId) {
      return db.all('SELECT id, title, semantic_summary AS content, created_at, embedding_blob FROM trajectories WHERE status = \'rejected\' ORDER BY created_at DESC LIMIT 50');
    }
    return db.all('SELECT id, title, semantic_summary AS content, created_at, embedding_blob FROM trajectories WHERE status = \'rejected\' AND (workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ?)) ORDER BY created_at DESC LIMIT 50', organizationId);
  } catch (_) {
    return [];
  }
}

async function fetchFailureCandidates(db, context) {
  const organizationId = context.organizationId || null;
  const decisions = await fetchDecisionFailures(db, organizationId, 50);
  const rejected = await fetchRejectedTrajectories(db, organizationId);
  return decisions.concat(rejected);
}

function vectorForItem(item, scoring) {
  const decoded = decodeEmbeddingBlob(item.embedding_blob);
  if (decoded.length === 768) return decoded;
  return scoring.textToVector(String(item.title || '') + ' ' + String(item.content || ''));
}

function scoreCandidates(queryVec, candidates, formatHit) {
  const scoring = require('../memoryScoring');
  const ranked = [];
  for (const item of candidates) {
    const itemVec = vectorForItem(item, scoring);
    const sim = scoring.cosineSimilarity(queryVec, itemVec);
    ranked.push(formatHit(item, sim));
  }
  ranked.sort(compareHits);
  return ranked;
}

function compareHits(a, b) {
  return b.similarity - a.similarity;
}

function formatSearchHit(item, similarity) {
  return { id: item.id, title: item.title, content: item.content, created_at: item.created_at, similarity: Number(similarity.toFixed(4)) };
}

function formatAvoidHit(item, similarity) {
  return { id: item.id, title: item.title, content: String(item.content || '').slice(0, 300), similarity: Number(similarity.toFixed(4)), createdAt: item.created_at };
}

function stripBlobs(rows) {
  const clean = [];
  for (const row of rows) {
    clean.push({ id: row.id, title: row.title, content: row.content, created_at: row.created_at });
  }
  return clean;
}

function emitAvoidTelemetry(assessment, verdict) {
  const telemetry = require('../telemetryObserver');
  telemetry.emitEvent({
    eventType: 'DEAD_END_AVOIDANCE_CHECKED',
    agentId: assessment.agentId,
    action: 'AVOID_DEAD_ENDS',
    detail: 'Dead-end risk evaluated: ' + verdict.label + ' (score: ' + verdict.bestScore + ', threshold: ' + assessment.threshold + ')',
    severity: verdict.severity,
    payload: { isDeadEndRisk: verdict.isDeadEndRisk, bestScore: verdict.bestScore, threshold: assessment.threshold, matchedFailure: verdict.bestMatch }
  });
}

function buildAvoidVerdict(ranked, assessment) {
  const matchingFailures = ranked.slice(0, assessment.limit);
  const bestMatch = matchingFailures[0] || null;
  const bestScore = bestMatch ? bestMatch.similarity : 0;
  const isDeadEndRisk = bestScore >= assessment.threshold;
  let warning = null;
  if (isDeadEndRisk) {
    warning = 'Action or task closely resembles known dead end (' + (bestScore * 100).toFixed(1) + '% match): "' + (bestMatch.title || bestMatch.content) + '". Recommended avoidance.';
  }
  let severity = 'info';
  if (isDeadEndRisk) severity = 'warning';
  const verdict = { isDeadEndRisk: isDeadEndRisk, bestScore: bestScore, bestMatch: bestMatch, severity: severity, label: isDeadEndRisk ? 'RISK DETECTED' : 'CLEAR' };
  emitAvoidTelemetry(assessment, verdict);
  let matchedFailure = null;
  if (isDeadEndRisk) matchedFailure = bestMatch;
  return { success: true, isDeadEndRisk: isDeadEndRisk, riskScore: bestScore, threshold: assessment.threshold, matchedFailure: matchedFailure, matchingFailures: matchingFailures, warning: warning };
}

module.exports = {
  decodeEmbeddingBlob,
  buildQueryText,
  resolveQueryVector,
  fetchDecisionFailures,
  fetchRejectedTrajectories,
  fetchFailureCandidates,
  scoreCandidates,
  formatSearchHit,
  formatAvoidHit,
  stripBlobs,
  buildAvoidVerdict
};
