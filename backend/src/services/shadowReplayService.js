'use strict';

/**
 * Shadow Graph Execution (ablation causale du control plane, sans LLM).
 *
 * La variance sémantique est exclue par construction : on rejoue des
 * événements TÉLÉMÉTRIQUES enregistrés à travers les fonctions pures et
 * bornées du plan de contrôle (saillance, ignition, hiérarchie) sur un
 * store mémoire vierge — deux runs identiques donnent un état identique.
 * Ablation = rejouer sans une classe d'événements ; le delta d'état
 * (saillance, bursts, propagations, compteurs) mesure l'effet causal.
 * recordAttempt() constitue parallèlement le registre des appels LLM
 * (uri, succès, coût, latence) pour un futur rejeu à réponses mockées.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');
const { computeSalience } = require('./autobiographicalMemory/salience');

const LEDGER_SCOPE = 'llm_cache';
const LEDGER_LIMIT = 100;
const REPLAY_LIMIT = 300;

function memoryStore() {
  const tables = new Map();
  return {
    get: async (sql, scope, key) => (tables.has(`${scope}|${key}`) ? { payload_json: tables.get(`${scope}|${key}`) } : null),
    all: async () => [],
    run: async (sql, ...parameters) => {
      const [scope, key, payload] = parameters;
      if (scope && !String(sql).includes('adaptive_state_events')) tables.set(`${scope}|${key}`, payload);
    }
  };
}

function parsePayload(event) {
  try {
    const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json || {};
    return payload && typeof payload === 'object' ? payload : {};
  } catch (_) {
    return {};
  }
}

function attemptEntry(data) {
  return {
      uri: data.uri,
      success: data.success === true,
      costUsd: Number(data.costUsd) || 0,
      latencyMs: Number(data.latencyMs) || 0,
      servedModel: typeof data.servedModel === 'string' ? data.servedModel : null,
      at: new Date().toISOString()
  };
}

async function recordAttempt(db, record) {
  const data = record || {};
  if (typeof data.uri !== 'string' || !data.uri) return null;
  try {
    const store = new AdaptiveStateService(db || null);
    if (!db) return null;
    const stored = (await store.restoreObject(LEDGER_SCOPE, 'attempts')) || {};
    const attempts = Array.isArray(stored.attempts) ? stored.attempts : [];
    const entry = attemptEntry(data);
    const bounded = [...attempts, entry].slice(-LEDGER_LIMIT);
    await store.persistObject(LEDGER_SCOPE, 'attempts', { attempts: bounded }, bounded.length);
    return entry;
  } catch (_) {
    return null;
  }
}

async function replayEvent(event, context, state) {
    const { ignition, hierarchy, db, agentId } = context;
    state.events += 1;
    state.salienceSum += computeSalience(event).salience;
    const charged = await ignition.charge(db, agentId, { weight: computeSalience(event).salience });
    if (charged.ignited) state.ignitions += 1;
    const routed = await hierarchy.routeEvent(db, agentId, event);
    if (routed?.propagate === 'strategy') state.propagations.strategy += 1;
    if (routed?.propagate === 'mission') state.propagations.mission += 1;
    if (routed?.counters) state.counters = { ...routed.counters };
}

async function replayControlPlane(events, options) {
  const settings = options || {};
  const dropped = new Set(Array.isArray(settings.dropEventTypes) ? settings.dropEventTypes : []);
  const context = {
    ignition: require('./ignitionService'),
    hierarchy: require('./predictiveHierarchyService'),
    db: memoryStore(),
    agentId: settings.agentId || 'replay-agent'
  };
  const state = { events: 0, salienceSum: 0, ignitions: 0, propagations: { strategy: 0, mission: 0 }, counters: { actionErrors: 0, strategyRevisions: 0 } };
  for (const event of events || []) {
    if (dropped.has(event.eventType)) continue;
    await replayEvent(event, context, state);
  }
  state.salienceSum = Math.round(state.salienceSum * 1000) / 1000;
  return state;
}

async function fetchWindow(db, agentId, options) {
  const settings = options || {};
  const since = String(settings.since || '1970-01-01 00:00:00').replace('T', ' ').slice(0, 19);
  const rows = await db.all(
    `SELECT event_type, detail, severity, payload_json, created_at FROM telemetry_events WHERE agent_id = ? AND created_at >= ? ORDER BY created_at ASC LIMIT ${REPLAY_LIMIT}`,
    agentId, since
  );
  return (rows || []).map((row) => ({
    eventType: row.event_type,
    detail: row.detail || '',
    severity: row.severity || 'info',
    payload: parsePayload(row)
  }));
}

async function ablateAndCompare(db, agentId, options) {
  const settings = options || {};
  if (!db || !agentId) return { status: 'insufficient_data' };
  try {
    const events = await fetchWindow(db, agentId, settings);
    if (!events.length) return { status: 'insufficient_data', reason: 'no events' };
    const intact = await replayControlPlane(events, { agentId });
    const ablated = await replayControlPlane(events, { agentId, dropEventTypes: settings.dropEventTypes || [] });
    const delta = {
      dEvents: intact.events - ablated.events,
      dSalience: Math.round((intact.salienceSum - ablated.salienceSum) * 1000) / 1000,
      dIgnitions: intact.ignitions - ablated.ignitions,
      dPropagations: (intact.propagations.strategy + intact.propagations.mission) - (ablated.propagations.strategy + ablated.propagations.mission)
    };
    const matters = delta.dSalience !== 0 || delta.dIgnitions !== 0 || delta.dPropagations !== 0;
    return { status: 'measured', agentId, events: intact.events, dropped: settings.dropEventTypes || [], intact, ablated, delta, matters };
  } catch (_) {
    return { status: 'unavailable' };
  }
}

module.exports = { recordAttempt, replayControlPlane, ablateAndCompare };
