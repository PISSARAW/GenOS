'use strict';

/**
 * Reconstruction déterministe des rapports (source monitoring inversé).
 *
 * Le rapport factuel est CALCULÉ depuis les traces (télémétrie, evidence,
 * world-model, efférence, ledger causal), jamais généré par le LLM : celui-ci
 * ne reçoit qu'un renderHint contraignant ("verbaliser SEULEMENT ces faits").
 * borné (200 événements/agent), ne lève jamais : 'insufficient_data' ou
 * 'unavailable' sinon. Fenêtre = activité récente (pas de filtre mission).
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const EVENT_LIMIT = 200;

function parsePayload(event) {
  try {
    const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json || {};
    return payload && typeof payload === 'object' ? payload : {};
  } catch (_) {
    return {};
  }
}

async function toolExecutions(db, agentId, since) {
  const rows = await db.all(
    `SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type IN ('ORCHESTRATION_ACTION_EXECUTED', 'ORCHESTRATION_ACTION_FAILED') AND created_at >= ? ORDER BY created_at DESC LIMIT ${EVENT_LIMIT}`,
    agentId, since
  );
  const counts = {};
  for (const row of rows || []) {
    const tool = parsePayload(row).tool;
    if (typeof tool === 'string' && tool) counts[tool] = (counts[tool] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);
}

async function evidenceOutcomes(db, agentId, since) {
  const rows = await db.all(
    `SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = 'EVIDENCE_REPORT' AND created_at >= ? ORDER BY created_at DESC LIMIT ${EVENT_LIMIT}`,
    agentId, since
  );
  let success = 0;
  let failed = 0;
  let claims = 0;
  for (const row of rows || []) {
    const report = parsePayload(row).evidenceReport || parsePayload(row).report || {};
    if (report.outcome === 'success') success += 1;
    else if (report.outcome === 'failed') failed += 1;
    if (Array.isArray(report.claims)) claims += report.claims.length;
  }
  return { reports: success + failed, success, failed, claims };
}

async function scopeList(db, agentId, { scope, key }) {
  try {
    const stored = (await new AdaptiveStateService(db).restoreObject(scope, agentId)) || {};
    const list = stored[key];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function sqliteUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

async function reconstructionFacts(db, agentId, since) {
    const toolsUsed = await toolExecutions(db, agentId, since);
    const evidence = await evidenceOutcomes(db, agentId, since);
    const transitions = await scopeList(db, agentId, { scope: 'world_model', key: 'transitions' });
    const resolved = transitions.filter((entry) => entry.status === 'resolved');
    const surprises = resolved.map((entry) => Number(entry.surprise) || 0);
    const copies = await scopeList(db, agentId, { scope: 'efference', key: 'copies' });
    const discharged = copies.filter((entry) => entry.consumed === true).length;
    const edges = await scopeList(db, agentId, { scope: 'causal_ledger', key: 'edges' });
    return { toolsUsed, evidence, resolved, surprises, copies, discharged, edges };
}

function reconstructionRates({ surprises, copies, discharged }) {
  return {
    meanSurprise: surprises.length ? surprises.reduce((t, v) => t + v, 0) / surprises.length : null,
    reafferenceRate: copies.length ? discharged / copies.length : null
  };
}

async function reconstruct(db, agentId, options) {
  const settings = options || {};
  if (!db || !agentId) return { status: 'insufficient_data', reason: 'missing agent' };
  try {
    const since = sqliteUtc(Number(settings.sinceMs || (Date.now() - 24 * 3600 * 1000)));
    const { toolsUsed, evidence, resolved, surprises, copies, discharged, edges } = await reconstructionFacts(db, agentId, since);
    const rates = reconstructionRates({ surprises, copies, discharged });
    if (!toolsUsed.length && !evidence.reports && !resolved.length && !edges.length) {
      return { status: 'insufficient_data', reason: 'no activity', agentId };
    }
    return {
      status: 'measured',
      agentId,
      since,
      toolsUsed,
      evidence,
      meanSurprise: rates.meanSurprise,
      resolvedTransitions: resolved.length,
      reafferenceRate: rates.reafferenceRate,
      causalEdges: edges.length,
      renderHint: 'Verbalize ONLY these facts. Do not invent tools, numbers, causes or quotes. Beyond these facts, return no_answer with method.'
    };
  } catch (_) {
    return { status: 'unavailable', agentId };
  }
}

module.exports = { reconstruct };
