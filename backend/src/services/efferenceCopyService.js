'use strict';

/**
 * Copie d'efférence / décharge corollaire (soi-monde causal, HOT).
 *
 * Toute action décidée enregistre une prédiction de ses conséquences
 * sensorielles (predict). Quand un événement arrive, discharge cherche la
 * copie correspondante : correspondance = réafférence (auto-causée,
 * atténuée × 0.5) ; sinon exafférence (cause externe, poids plein).
 * Chaque décharge réussie nourrit CoreSelf (erreur = 1 - force du match).
 *
 * predict lève en cas d'entrée invalide ou de stockage indisponible
 * (l'appelant orchestre en best-effort) ; discharge ne lève jamais.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'efference';
const LEDGER_LIMIT = 20;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const REAFFERENCE_WEIGHT = 0.5;

async function openDb(handle) {
  if (handle && typeof handle.get === 'function') return { db: handle, close: null };
  const { getDatabase } = require('./db');
  const db = await getDatabase();
  return { db, close: () => require('./db').closeDatabase().catch(() => {}) };
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function validPrediction(prediction) {
  return prediction && typeof prediction === 'object'
    && typeof prediction.action === 'string' && !!prediction.action.trim();
}

function normalizePrediction(prediction, now) {
  return {
    id: `eff_${now}_${Math.floor(Math.random() * 0xffff).toString(16)}`,
    actionId: typeof prediction.actionId === 'string' ? prediction.actionId : null,
    action: prediction.action.trim().slice(0, 120),
    tool: typeof prediction.tool === 'string' ? prediction.tool.slice(0, 120) : null,
    expectedTypes: Array.isArray(prediction.expectedTypes)
      ? prediction.expectedTypes.filter((type) => typeof type === 'string').slice(0, 8)
      : [],
    expectedDetail: typeof prediction.expectedDetail === 'string' ? prediction.expectedDetail.slice(0, 160) : null,
    createdAt: now,
    ttlMs: Number.isFinite(Number(prediction.ttlMs)) && Number(prediction.ttlMs) > 0
      ? Number(prediction.ttlMs)
      : DEFAULT_TTL_MS,
    consumed: false
  };
}

function copyLive(copy, now) {
  return !copy.consumed && now - copy.createdAt < copy.ttlMs;
}

function matchStrength(copy, event) {
  const payload = event.payload || {};
  const detail = String(event.detail || '');
  if (copy.actionId && (payload.sourceActionId === copy.actionId || payload.sourceEventId === copy.actionId)) return 1;
  if (copy.expectedDetail && detail.includes(copy.expectedDetail)) return 1;
  if (copy.expectedTypes.includes(event.eventType)) return 0.7;
  return 0;
}

function pruneCopies(copies, now) {
  return copies.filter((copy) => copyLive(copy, now)).slice(-LEDGER_LIMIT);
}

async function recordDischargeAttribution(input) {
  try {
    const coreSelf = require('./coreSelfService');
    await coreSelf.recordAttribution(input.db, input.agentId, {
      actionId: input.copy.id,
      attributedToSelf: true,
      predictionError: clamp01(1 - input.strength)
    });
  } catch (_) {}
}

async function predict(db, agentId, prediction) {
  if (!agentId || !validPrediction(prediction)) {
    throw new Error('predict requires agentId and a valid prediction');
  }
  let opened = null;
  try {
    opened = await openDb(db);
    const now = Date.now();
    const store = new AdaptiveStateService(opened.db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    const copies = Array.isArray(stored.copies) ? stored.copies : [];
    const bounded = [...pruneCopies(copies, now), normalizePrediction(prediction, now)].slice(-LEDGER_LIMIT);
    await store.persistObject(SCOPE, agentId, { copies: bounded }, bounded.length);
    return bounded[bounded.length - 1];
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

async function discharge(db, agentId, event) {
  if (!agentId || !event) return { matched: false };
  let opened = null;
  try {
    opened = await openDb(db);
    const now = Date.now();
    const store = new AdaptiveStateService(opened.db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    const copies = Array.isArray(stored.copies) ? stored.copies : [];
    let hit = null;
    let strength = 0;
    for (const copy of copies) {
      if (!copyLive(copy, now)) continue;
      const score = matchStrength(copy, event);
      if (score > strength) {
        strength = score;
        hit = copy;
      }
      if (strength >= 1) break;
    }
    if (!hit) return { matched: false };
    const remaining = pruneCopies(copies.map((copy) => (copy.id === hit.id ? { ...copy, consumed: true } : copy)), now);
    await store.persistObject(SCOPE, agentId, { copies: remaining }, remaining.length);
    await recordDischargeAttribution({ db: opened.db, agentId, copy: hit, strength });
    return { matched: true, copyId: hit.id, attenuation: REAFFERENCE_WEIGHT, strength };
  } catch (_) {
    return { matched: false };
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

module.exports = { predict, discharge, REAFFERENCE_WEIGHT };
