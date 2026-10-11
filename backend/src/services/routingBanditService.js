'use strict';

/**
 * Bandit contextuel LinUCB pour le routage de modèles (apprentissage borné).
 *
 * Première représentation VRAIMENT apprise du runtime (le reste est
 * heuristique) : par route URI, une régression ridge incrémentale
 * (Ainv maintenue par Sherman-Morrison exact, b, pulls, sumR), contexte
 * à 6 dimensions, récompense = succès pondéré coût/latence.
 * Bornes : 16 bras max (éviction du moins tiré), contexte et récompense
 * normalisés, état inspectable dans adaptive_state scope 'routing_bandit'.
 * Only independently verified mission outcomes may train this state.
 * Provider transport receipts remain accounting data, not success labels.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'routing_bandit_verified_v2';
const DIM = 7;
const MAX_ARMS = 16;
const ALPHA = 1.0;

function identity(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

function zeros(n) {
  return new Array(n).fill(0);
}

function dot(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

function matVec(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function featurize(input) {
  const data = input || {};
  const promptTokens = Math.max(0, Number(data.promptTokens) || 0);
  const reliability = Number(data.predictedReliability);
  return [
    1,
    Math.min(1, promptTokens / 8000),
    data.isWorker === true ? 1 : 0,
    Math.min(1, Number(data.quotedCostUsd) || 0),
    Math.min(1, (Number(data.predictedLatencyMs) || 0) / 60000),
    data.local === true ? 1 : 0,
    Number.isFinite(reliability) ? Math.max(0, Math.min(1, reliability)) : 0.5
  ];
}

function rewardOf(input) {
  if (input.success !== true) return 0;
  const cost = Math.max(0, Number(input.costUsd) || 0);
  const latency = Math.max(0, Number(input.latencyMs) || 0);
  return 1 / (1 + cost * 10 + latency / 30000);
}

function newArm() {
  return { Ainv: identity(DIM), b: zeros(DIM), pulls: 0, sumR: 0 };
}

function shermanMorrison(Ainv, x) {
  const Aix = matVec(Ainv, x);
  const denom = 1 + dot(x, Aix);
  return Ainv.map((row, i) => row.map((value, j) => value - (Aix[i] * Aix[j]) / denom));
}

function evictIfNeeded(arms) {
  const uris = Object.keys(arms);
  if (uris.length <= MAX_ARMS) return;
  let victim = uris[0];
  for (const uri of uris) {
    if ((arms[uri].pulls || 0) < (arms[victim].pulls || 0)) victim = uri;
  }
  delete arms[victim];
}

function armScore(arm, x) {
  const theta = matVec(arm.Ainv, arm.b);
  const Aix = matVec(arm.Ainv, x);
  return dot(theta, x) + ALPHA * Math.sqrt(Math.max(0, dot(x, Aix)));
}

async function loadArms(store) {
  const stored = (await store.restoreObject(SCOPE, 'linucb')) || {};
  const arms = stored.arms && typeof stored.arms === 'object' ? stored.arms : {};
  const probe = arms[Object.keys(arms)[0]];
  if (probe && (!Array.isArray(probe.b) || probe.b.length !== DIM)) return {};
  return arms;
}

function verifiedOutcome(verification) {
  return verification?.status === 'verified'
    && typeof verification.evidenceRef === 'string'
    && verification.evidenceRef.trim().length > 0;
}

function validObservation(db, data) {
  if (!db || typeof data.routeUri !== 'string' || !data.routeUri) return false;
  if (!verifiedOutcome(data.verification)) return false;
  return typeof data.success === 'boolean' && data.verification.success === data.success;
}

async function observe(db, input) {
  try {
    const data = input || {};
    if (!validObservation(db, data)) return null;
    const store = new AdaptiveStateService(db);
    const arms = await loadArms(store);
    if (!arms[data.routeUri]) arms[data.routeUri] = newArm();
    evictIfNeeded(arms);
    const arm = arms[data.routeUri];
    if (!arm) return null;
    const x = featurize(data);
    const reward = rewardOf(data);
    arm.Ainv = shermanMorrison(arm.Ainv, x);
    arm.b = arm.b.map((value, i) => value + reward * x[i]);
    arm.pulls += 1;
    arm.sumR += reward;
    await store.persistObject(SCOPE, 'linucb', { arms }, arm.pulls);
    return { uri: data.routeUri, pulls: arm.pulls, reward };
  } catch (_) {
    return null;
  }
}

async function recommend(db, input) {
  const data = input || {};
  const routes = Array.isArray(data.routes) ? data.routes.filter((uri) => typeof uri === 'string') : [];
  if (!db || !routes.length) return { ordering: [], explored: false };
  try {
    const store = new AdaptiveStateService(db);
    const arms = await loadArms(store);
    const x = featurize(data);
    const scored = [];
    for (const uri of routes) {
      const arm = arms[uri] || newArm();
      scored.push({ uri, score: armScore(arm, x), pulls: arm.pulls || 0 });
    }
    scored.sort((a, b) => b.score - a.score);
    return { ordering: scored, explored: scored.some((entry) => entry.pulls === 0) };
  } catch (_) {
    return { ordering: [], explored: false };
  }
}

async function report(db) {
  try {
    const stored = (await new AdaptiveStateService(db).restoreObject(SCOPE, 'linucb')) || {};
    const arms = stored.arms && typeof stored.arms === 'object' ? stored.arms : {};
    return {
      arms: Object.entries(arms).map(([uri, arm]) => ({
        uri,
        pulls: arm.pulls || 0,
        avgReward: arm.pulls ? (arm.sumR || 0) / arm.pulls : 0
      })),
      limitation: 'Canary explicit only; training requires an independent mission verdict and evidence reference.'
    };
  } catch (_) {
    return { arms: [] };
  }
}

function hashBucket(key) {
  const crypto = require('crypto');
  const digest = crypto.createHash('sha256').update(String(key)).digest();
  return digest.readUInt32BE(0) % 100;
}

function clampRate(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function numericOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function modelFromMeta(meta) {
  return [meta.model, meta.requestedModel, meta.servedModel]
    .find((value) => typeof value === 'string' && value.length > 0);
}

function usageRowFromMeta(row, meta) {
  if (!verifiedOutcome(meta.verification)) return null;
  if (typeof meta.verification.success !== 'boolean') return null;
  const model = modelFromMeta(meta);
  if (!model) return null;
  return {
    id: `ledger:${row.id}`,
    route: model,
    success: meta.verification.success,
    costUsd: numericOrZero(row.cost_usd ?? meta.costUsd),
    latencyMs: numericOrZero(meta.latencyMs),
    promptTokens: numericOrZero(meta.promptTokens),
    quotedCostUsd: numericOrZero(meta.quotedCostUsd),
    predictedLatencyMs: numericOrZero(meta.predictedLatencyMs)
  };
}

function parseUsageRow(row) {
  try { return usageRowFromMeta(row, JSON.parse(row.metadata_json || '{}')); }
  catch (_) { return null; }
}

function scoreCalibration(train, holdout) {
  const arms = {};
  for (const item of train) {
    const x = featurize(item);
    const reward = rewardOf(item);
    if (!arms[item.route]) arms[item.route] = newArm();
    arms[item.route].Ainv = shermanMorrison(arms[item.route].Ainv, x);
    arms[item.route].b = arms[item.route].b.map((value, i) => value + reward * x[i]);
    arms[item.route].pulls += 1;
  }
  let absolute = 0;
  let rewards = 0;
  let evaluated = 0;
  for (const item of holdout) {
    const arm = arms[item.route];
    if (!arm) continue;
    const predicted = Math.max(0, Math.min(1.5, dot(matVec(arm.Ainv, arm.b), featurize(item))));
    const actual = rewardOf(item);
    absolute += Math.abs(predicted - actual);
    rewards += actual;
    evaluated += 1;
  }
  if (!evaluated) return null;
  return { mae: absolute / evaluated, meanReward: rewards / evaluated, evaluated };
}

async function evaluateLoggedHoldout(db, options) {
  const settings = options || {};
  if (!db) return { status: 'insufficient_data', reason: 'missing db' };
  try {
    const limit = Math.max(20, Math.min(500, Math.floor(Number(settings.limit) || 200)));
    const rows = await db.all(
      `SELECT id, metadata_json, cost_usd FROM usage_ledger ORDER BY rowid DESC LIMIT ?`,
      limit
    );
    const log = (Array.isArray(rows) ? rows : []).map(parseUsageRow).filter(Boolean).reverse();
    if (log.length < 20) return { status: 'insufficient_data', reason: 'too few logged decisions', n: log.length };
    const cut = Math.floor(log.length * 0.7);
    const scored = scoreCalibration(log.slice(0, cut), log.slice(cut));
    if (!scored) return { status: 'insufficient_data', reason: 'no overlapping arms' };
    return { status: 'measured', n: log.length, train: cut, holdout: log.length - cut, mae: scored.mae, meanReward: scored.meanReward };
  } catch (_) {
    return { status: 'unavailable' };
  }
}

async function canaryAllowed(db) {
  try {
    if (!db) return true;
    const stored = await new AdaptiveStateService(db).restoreObject('canary_experiment', 'current');
    if (stored?.lastResult?.passed === false) return false;
    return true;
  } catch (_) {
    return true;
  }
}

function explicitRouteChoice(list, settings) {
  if (typeof settings.explicitRoute === 'string' && list.includes(settings.explicitRoute)) {
    return { choice: settings.explicitRoute, mode: 'explicit', ordering: [settings.explicitRoute, ...list.filter((uri) => uri !== settings.explicitRoute)] };
  }
  return null;
}

function policyFallbackChoice(list, reason) {
  return { choice: list[0], mode: 'policy', reason, ordering: list };
}

function banditOrderingChoice(list, top) {
  const ordering = [top.uri, ...list.filter((uri) => uri !== top.uri)];
  const disagreement = top.uri !== list[0];
  return { choice: top.uri, mode: 'bandit', reason: disagreement ? 'disagreement' : 'agree', disagreement, ordering };
}

async function resolveBanditRecommendation(db, list, settings) {
  const allowed = await canaryAllowed(db);
  if (!allowed) return policyFallbackChoice(list, 'gate-closed');
  const context = chooseWithGuardrailsContext(settings);
  const rec = await recommend(db, { ...context, routes: list });
  const top = rec.ordering[0];
  const minPulls = Math.max(1, Math.floor(Number(settings.minPulls) || 5));
  if (!top || top.pulls < minPulls) return policyFallbackChoice(list, 'cold');
  return banditOrderingChoice(list, top);
}

async function chooseWithGuardrails(db, candidates, policy) {
  const list = Array.isArray(candidates) ? candidates.filter((uri) => typeof uri === 'string') : [];
  const settings = policy || {};
  if (!list.length) return { choice: null, mode: 'empty', ordering: [] };
  const explicit = explicitRouteChoice(list, settings);
  if (explicit) return explicit;
  const rate = clampRate(settings.canaryRate, 0.05);
  if (hashBucket(settings.canaryKey || 'default') >= rate * 100) {
    return { choice: list[0], mode: 'policy', ordering: list };
  }
  try {
    return await resolveBanditRecommendation(db, list, settings);
  } catch (_) {
    return { choice: list[0], mode: 'policy', ordering: list };
  }
}

module.exports = { observe, recommend, report, chooseWithGuardrails, evaluateLoggedHoldout, scoreCalibration, parseUsageRow, canaryAllowed, DIM, MAX_ARMS };

function chooseWithGuardrailsContext(settings) {
  return settings.context && typeof settings.context === 'object' ? settings.context : {};
}
