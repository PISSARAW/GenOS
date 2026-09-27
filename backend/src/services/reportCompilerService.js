'use strict';

/**
 * Compilateur de rapport mission (graphe de vérité, pas narration LLM).
 *
 * buildTruthGraph : noeuds (exécutions d'outils avec reçus, claims avec
 * preuves, observations surprise, arêtes causales enregistrées) et arêtes
 * claim→outil par citation documentée comme heuristique.
 * compileReport : réponse canonique {claims: [{id, proposition, sources,
 * causedBy, confidence, contradictedBy}]} ; confiance = supported /
 * contested (collision d'énoncés normalisés à issues différentes) /
 * unverified. verifyRendering : chaque tag [claim:ID] doit résoudre ;
 * claims non cités signalés. Le LLM ne rend que ce qui compile.
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

function sqliteUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeStatement(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
}

async function scopeList(db, agentId, scope, key) {
  try {
    const stored = (await new AdaptiveStateService(db).restoreObject(scope, agentId)) || {};
    const list = stored[key];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

async function buildTruthGraph(db, agentId, options) {
  const settings = options || {};
  if (!db || !agentId) return { nodes: [], edges: [], status: 'insufficient_data' };
  try {
    const since = sqliteUtc(Number(settings.sinceMs || (Date.now() - 24 * 3600 * 1000)));
    const mission = typeof settings.missionId === 'string' && settings.missionId ? settings.missionId : null;
    const missionClause = mission ? ` AND json_extract(payload_json, '$.executionRunId') = ?` : '';
    const missionParams = mission ? [mission] : [];
    const actionRows = await db.all(
      `SELECT id, event_type, payload_json, created_at FROM telemetry_events WHERE agent_id = ? AND event_type IN ('ORCHESTRATION_ACTION_EXECUTED', 'ORCHESTRATION_ACTION_FAILED') AND created_at >= ?${missionClause} ORDER BY created_at DESC LIMIT ${EVENT_LIMIT}`,
      agentId, since, ...missionParams
    );
    const reportRows = await db.all(
      `SELECT id, payload_json, created_at FROM telemetry_events WHERE agent_id = ? AND event_type = 'EVIDENCE_REPORT' AND created_at >= ?${missionClause} ORDER BY created_at DESC LIMIT ${EVENT_LIMIT}`,
      agentId, since, ...missionParams
    );
    const nodes = [];
    const edges = [];
    const toolNodeOf = {};
    for (const row of actionRows || []) {
      const payload = parsePayload(row);
      if (typeof payload.tool !== 'string' || !payload.tool) continue;
      const id = `tool_${row.id}`;
      toolNodeOf[payload.tool] = toolNodeOf[payload.tool] || [];
      toolNodeOf[payload.tool].push(id);
      nodes.push({ id, kind: 'tool_execution', tool: payload.tool, success: payload.result?.success === true, at: row.created_at });
    }
    const transitions = await scopeList(db, agentId, 'world_model', 'transitions');
    for (const entry of transitions) {
      if (entry.status !== 'resolved') continue;
      nodes.push({ id: `obs_${entry.id}`, kind: 'observation', surprise: Number(entry.surprise) || 0, success: entry.success === true });
    }
    const ledger = await scopeList(db, agentId, 'causal_ledger', 'edges');
    for (const edge of ledger) {
      nodes.push({ id: edge.id, kind: 'causal_link', label: edge.kind, summary: edge.summary });
      for (const cause of edge.causeIds || []) edges.push({ from: cause, to: edge.id, kind: 'caused_by_recorded' });
    }
    let claimIndex = 0;
    for (const row of reportRows || []) {
      const payload = parsePayload(row);
      const report = payload.evidenceReport || payload.report || {};
      for (const claim of Array.isArray(report.claims) ? report.claims : []) {
        claimIndex += 1;
        const id = `claim_${claimIndex}`;
        const text = `${claim.statement || ''} ${(Array.isArray(claim.evidence) ? claim.evidence : []).map(String).join(' ')}`.toLowerCase();
        const sources = Object.keys(toolNodeOf).filter((tool) => text.includes(tool.toLowerCase()));
        nodes.push({
          id,
          kind: 'claim',
          proposition: String(claim.statement || '').slice(0, 200),
          outcome: report.outcome || 'unknown',
          reportEventId: row.id,
          sources: sources.flatMap((tool) => toolNodeOf[tool]),
          evidence: Array.isArray(claim.evidence) ? claim.evidence.length : 0
        });
        for (const tool of sources) {
          for (const nodeId of toolNodeOf[tool]) edges.push({ from: nodeId, to: id, kind: 'supports' });
        }
      }
    }
    return { nodes, edges, status: nodes.length ? 'measured' : 'insufficient_data' };
  } catch (_) {
    return { nodes: [], edges: [], status: 'unavailable' };
  }
}

function compileReport(graph) {
  const source = graph || {};
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  const edges = Array.isArray(source.edges) ? source.edges : [];
  const causedByOf = {};
  for (const edge of edges) {
    if (edge.kind !== 'caused_by_recorded') continue;
    causedByOf[edge.to] = causedByOf[edge.to] || [];
    causedByOf[edge.to].push(edge.from);
  }
  const byNorm = {};
  const claims = nodes.filter((node) => node.kind === 'claim').map((node) => {
    const norm = normalizeStatement(node.proposition);
    byNorm[norm] = byNorm[norm] || [];
    const sourced = Array.isArray(node.sources) && node.sources.length > 0;
    const claim = {
      id: node.id,
      proposition: node.proposition,
      outcome: node.outcome || 'unknown',
      sources: node.sources || [],
      causedBy: causedByOf[node.id] || [],
      confidence: (node.evidence || 0) > 0 && sourced ? 'supported' : 'unverified',
      contradictedBy: []
    };
    byNorm[norm].push(claim);
    return claim;
  });
  for (const group of Object.values(byNorm)) {
    if (new Set(group.map((claim) => claim.outcome)).size > 1) {
      for (const claim of group) {
        claim.confidence = 'contested';
        claim.contradictedBy = group.filter((other) => other.id !== claim.id).map((other) => other.id);
      }
    }
  }
  return { claims, warnings: claims.filter((claim) => claim.confidence !== 'supported').map((claim) => claim.id) };
}

const HEDGE_WORDS = ['maybe', 'possibly', 'might', 'could', 'uncertain', 'unknown', 'perhaps', 'suggests', 'appears', 'peut-etre', 'incertain'];

function looksFactual(text) {
  const lower = String(text || '').toLowerCase();
  if (HEDGE_WORDS.some((hedge) => lower.includes(hedge))) return false;
  return /\d/.test(lower) || lower.length > 80;
}

function verifyRendering(graph, sentences) {
  const known = new Set((graph.nodes || []).map((node) => node.id));
  const unresolved = [];
  const cited = new Set();
  for (const sentence of Array.isArray(sentences) ? sentences : []) {
    const tags = String(sentence.text || '').match(/\[claim:[^\]]+\]/g) || [];
    for (const tag of tags) {
      const id = tag.slice(7, -1);
      cited.add(id);
      if (!known.has(id)) unresolved.push({ sentence: String(sentence.text).slice(0, 120), tag });
    }
    for (const id of sentence.claimIds || []) {
      cited.add(id);
      if (!known.has(id)) unresolved.push({ sentence: String(sentence.text).slice(0, 120), tag: `[claim:${id}]` });
    }
  }
  const uncovered = (graph.nodes || []).filter((node) => node.kind === 'claim' && !cited.has(node.id)).map((node) => node.id);
  const uncitedFactual = [];
  for (const sentence of Array.isArray(sentences) ? sentences : []) {
    const text = String(sentence.text || '');
    if (!text.match(/\[claim:[^\]]+\]/g) && !(sentence.claimIds || []).length && looksFactual(text)) {
      uncitedFactual.push(text.slice(0, 120));
    }
  }
  return { unresolved, uncovered, uncitedFactual, ok: unresolved.length === 0 && uncitedFactual.length === 0 };
}

function resolveWorkerTags(report, validIds) {
  const allowed = new Set(Array.isArray(validIds) ? validIds : []);
  let text = '';
  try {
    text = JSON.stringify(report || {});
  } catch (_) {
    return [];
  }
  const tags = text.match(/\[worker:[^\]]+\]/g) || [];
  const unresolved = [];
  for (const tag of tags) {
    const id = tag.slice(8, -1);
    if (!allowed.has(id)) unresolved.push(tag);
  }
  return [...new Set(unresolved)];
}

module.exports = { buildTruthGraph, compileReport, verifyRendering, resolveWorkerTags };
