'use strict';

/**
 * Modèle du monde par transitions (JEPA du pauvre, assumé).
 *
 * Extension étatique de la copie d'efférence (qui prédit l'occurrence
 * d'événements) : chaque action prédit le SUCCÈS de son exécution, l'écart
 * observé donne une surprise mesurée (échec inattendu = 1, succès = 0,
 * détail inattendu = 0.25). La surprise ≥ 0.5 lève le signal `surprise`
 * (déjà consommé par computeSalience) sur l'événement émis.
 * Registre borné (20 transitions) en adaptive_state scope 'world_model'.
 * Pas d'apprentissage de représentations : rollout contrefactuel = étape
 * suivante (brancher les mondes Trinity sur actions hypothétiques).
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'world_model';
const LEDGER_LIMIT = 20;
const RESOLVED_KEEP = 10;
const SURPRISE_FLAG_AT = 0.5;

async function openDb(handle) {
  if (handle && typeof handle.get === 'function') return { db: handle, close: null };
  const { getDatabase } = require('./db');
  const db = await getDatabase();
  return { db, close: () => require('./db').closeDatabase().catch(() => {}) };
}

function validPrediction(prediction) {
  return prediction && typeof prediction === 'object'
    && typeof prediction.action === 'string' && !!prediction.action.trim();
}

function normalizePrediction(prediction, now) {
  return {
    id: `wm_${now}_${Math.floor(Math.random() * 0xffff).toString(16)}`,
    actionId: typeof prediction.actionId === 'string' ? prediction.actionId : null,
    action: prediction.action.trim().slice(0, 120),
    predicted: {
      expectSuccess: prediction.expectSuccess !== false,
      expectedDetail: typeof prediction.expectedDetail === 'string' ? prediction.expectedDetail.slice(0, 160) : null
    },
    status: 'pending',
    createdAt: now
  };
}

function scoreSurprise(predicted, observation) {
  if (observation.success !== true) return 1;
  if (predicted.expectedDetail && !String(observation.detail || '').includes(predicted.expectedDetail)) return 0.25;
  return 0;
}

function pruneTransitions(all) {
  const pending = all.filter((entry) => entry.status === 'pending');
  const resolved = all.filter((entry) => entry.status !== 'pending').slice(-RESOLVED_KEEP);
  return [...pending, ...resolved].slice(-LEDGER_LIMIT);
}

async function predictTransition(db, agentId, prediction) {
  if (!agentId || !validPrediction(prediction)) {
    throw new Error('predictTransition requires agentId and a valid prediction');
  }
  let opened = null;
  try {
    opened = await openDb(db);
    const store = new AdaptiveStateService(opened.db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    const all = Array.isArray(stored.transitions) ? stored.transitions : [];
    const bounded = [...pruneTransitions(all), normalizePrediction(prediction, Date.now())].slice(-LEDGER_LIMIT);
    await store.persistObject(SCOPE, agentId, { transitions: bounded }, bounded.length);
    return bounded[bounded.length - 1];
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

function findPending(all, observation) {
  if (observation.actionId) {
    const exact = all.find((entry) => entry.status === 'pending' && entry.actionId === observation.actionId);
    if (exact) return exact;
  }
  const pending = all.filter((entry) => entry.status === 'pending');
  return pending.length ? pending[pending.length - 1] : null;
}

async function observeTransition(db, agentId, observation) {
  const data = observation || {};
  const fallback = { matched: false, surprise: data.success === true ? 0 : 1 };
  if (!agentId) return fallback;
  let opened = null;
  try {
    opened = await openDb(db);
    const store = new AdaptiveStateService(opened.db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    const all = Array.isArray(stored.transitions) ? stored.transitions : [];
    const hit = findPending(all, data);
    if (!hit) return fallback;
    const surprise = scoreSurprise(hit.predicted || {}, data);
    const resolved = { ...hit, status: 'resolved', success: data.success === true, surprise, observedAt: new Date().toISOString() };
    const bounded = pruneTransitions(all.map((entry) => (entry.id === hit.id ? resolved : entry)));
    await store.persistObject(SCOPE, agentId, { transitions: bounded }, bounded.length);
    return { matched: true, transitionId: hit.id, surprise };
  } catch (_) {
    return fallback;
  }
}

module.exports = { predictTransition, observeTransition, SURPRISE_FLAG_AT };
