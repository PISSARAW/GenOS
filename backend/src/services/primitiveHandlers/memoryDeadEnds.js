/**
 * GenOS Cognitive Memory - Negative Knowledge & Dead-End Handlers
 * (searchFailures, avoidKnownDeadEnds, persistDeadEndDecisions)
 * Thin orchestrator: scoring/search blocks live in memoryFailureSearch.js
 * and identity blocks in deadEndIds.js so this file stays in the gate.
 */
const { getDatabase } = require('../../db');
const { deadEndDedupHash, resolveDeadEndIdentity, buildDeadEndTitle } = require('./deadEndIds');
const {
  decodeEmbeddingBlob,
  buildQueryText,
  resolveQueryVector,
  fetchDecisionFailures,
  fetchFailureCandidates,
  scoreCandidates,
  formatSearchHit,
  formatAvoidHit,
  stripBlobs,
  buildAvoidVerdict
} = require('./memoryFailureSearch');

async function searchFailures(context = {}) {
  const db = await getDatabase();
  const query = context.query || context.task || '';
  const limit = context.limit || 10;
  if (!query.trim()) {
    const rows = await fetchDecisionFailures(db, context.organizationId || null, limit);
    const failures = stripBlobs(rows);
    return { success: true, failureCount: failures.length, failures: failures };
  }
  const queryVec = await resolveQueryVector(query);
  const rows = await fetchDecisionFailures(db, context.organizationId || null, 50);
  const ranked = scoreCandidates(queryVec, rows, formatSearchHit);
  const failures = ranked.slice(0, limit);
  return { success: true, failureCount: failures.length, failures: failures };
}

async function avoidKnownDeadEnds(context = {}) {
  const db = await getDatabase();
  const query = buildQueryText(context);
  const threshold = typeof context.threshold === 'number' ? context.threshold : 0.60;
  const limit = context.limit || 5;
  if (!query.trim()) {
    return { success: true, isDeadEndRisk: false, riskScore: 0, matchedFailure: null, matchingFailures: [], warning: null };
  }
  const queryVec = await resolveQueryVector(query);
  const candidates = await fetchFailureCandidates(db, context);
  const ranked = scoreCandidates(queryVec, candidates, formatAvoidHit);
  const assessment = { limit: limit, threshold: threshold, agentId: context.agentId || 'strategy_adapter' };
  return buildAvoidVerdict(ranked, assessment);
}

async function storeDeadEnd(db, deadEnd, options) {
  const identity = resolveDeadEndIdentity(deadEnd, options);
  const deadEndId = deadEndDedupHash(identity.agent, identity.detail, identity.step);
  const vec = await resolveQueryVector(String(identity.detail));
  const buffer = Buffer.from(new Float32Array(vec).buffer);
  await db.run(
    'INSERT OR IGNORE INTO genome_decisions (id, title, content, cart_nodes_json, created_by, category, embedding_blob, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    deadEndId,
    buildDeadEndTitle(deadEnd, identity.detail),
    JSON.stringify(deadEnd),
    JSON.stringify([identity.step]),
    identity.agent,
    'Failure',
    buffer,
    options.organizationId || null,
    options.projectId || null
  );
  return deadEndId;
}

async function persistDeadEndDecisions(db, deadEndSteps = [], options = {}) {
  if (!Array.isArray(deadEndSteps)) return [];
  if (deadEndSteps.length === 0) return [];
  const insertedIds = [];
  for (const deadEnd of deadEndSteps) {
    insertedIds.push(await storeDeadEnd(db, deadEnd, options));
  }
  return insertedIds;
}

module.exports = {
  decodeEmbeddingBlob,
  searchFailures,
  avoidKnownDeadEnds,
  persistDeadEndDecisions
};
