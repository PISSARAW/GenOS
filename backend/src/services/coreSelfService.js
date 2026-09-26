'use strict';

/**
 * CoreSelf — frontière self/world et attribution d'agency (strate P1).
 *
 * Strate décrite par spec/agent-self.schema.json#CoreSelfLayer :
 * agencyCalibration (part réelle d'actions attribuées au soi, calibrée par
 * l'erreur de prédiction), lastAttributions (10 dernières, bornées) et
 * selfOriginRatio (fraction des claims actifs d'origine SelfGenerated ou
 * SelfObserved, heuristique lexicale sur claim_json).
 *
 * L'historique est persisté dans adaptive_state (scope core_self) et alimenté
 * à chaque run terminal par selfModelService.calibrate : erreur de prédiction
 * = |succès attendu - succès observé|, soi = exécution sans délégation.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'core_self';
const HISTORY_LIMIT = 20;
const SHOWN_LIMIT = 10;
const SELF_ORIGINS = new Set(['SelfGenerated', 'SelfObserved']);

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function meanError(entries) {
  if (!entries.length) return 0;
  return entries.reduce((total, entry) => total + entry.predictionError, 0) / entries.length;
}

function validAttribution(attribution) {
  if (!attribution || typeof attribution !== 'object') return false;
  if (typeof attribution.actionId !== 'string' || !attribution.actionId) return false;
  if (typeof attribution.attributedToSelf !== 'boolean') return false;
  return Number.isFinite(Number(attribution.predictionError));
}

function normalizeAttribution(attribution) {
  return {
    actionId: attribution.actionId,
    attributedToSelf: attribution.attributedToSelf,
    predictionError: clamp01(attribution.predictionError),
    causalConfidence: clamp01(1 - Number(attribution.predictionError))
  };
}

function extractOrigin(claimJson) {
  try {
    const claim = JSON.parse(claimJson || '{}');
    return claim.origin || claim.claim?.origin || null;
  } catch (_) {
    return null;
  }
}

async function selfOriginRatio(db) {
  try {
    const rows = await db.all(`SELECT claim_json FROM epistemic_claims WHERE status = 'active' LIMIT 200`);
    let self = 0;
    let total = 0;
    for (const row of rows || []) {
      const origin = extractOrigin(row.claim_json);
      if (!origin) continue;
      total += 1;
      if (SELF_ORIGINS.has(origin)) self += 1;
    }
    if (!total) return null;
    return self / total;
  } catch (_) {
    return null;
  }
}

async function recordAttribution(db, agentId, attribution) {
  if (!db || !agentId || !validAttribution(attribution)) {
    throw new Error('recordAttribution requires db, agentId and a valid attribution');
  }
  const store = new AdaptiveStateService(db);
  const stored = (await store.restoreObject(SCOPE, agentId)) || {};
  const entries = Array.isArray(stored.entries) ? stored.entries : [];
  entries.push({ ...normalizeAttribution(attribution), at: new Date().toISOString() });
  const bounded = entries.slice(-HISTORY_LIMIT);
  await store.persistObject(SCOPE, agentId, { entries: bounded }, bounded.length);
  return bounded[bounded.length - 1];
}

async function loadCoreSelf(db, agentId) {
  if (!db || !agentId) return null;
  try {
    const store = new AdaptiveStateService(db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    const entries = Array.isArray(stored.entries) ? stored.entries : [];
    if (!entries.length) return null;
    const ratio = await selfOriginRatio(db);
    const core = {
      agencyCalibration: clamp01(1 - meanError(entries)),
      lastAttributions: entries.slice(-SHOWN_LIMIT)
    };
    if (ratio !== null) core.selfOriginRatio = ratio;
    return core;
  } catch (_) {
    return null;
  }
}

module.exports = { SCOPE, recordAttribution, loadCoreSelf };
