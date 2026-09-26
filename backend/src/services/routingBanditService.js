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
 * Étape actuelle : APPRENDRE (observe câblé sur chaque tentative).
 * AGIR (ordonner les fallbacks) = étape suivante, après audit de
 * désaccord routeur-vs-bandit. observe() ne lève jamais (money path).
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'routing_bandit';
const DIM = 6;
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
  return [
    1,
    Math.min(1, promptTokens / 8000),
    data.isWorker === true ? 1 : 0,
    Math.min(1, Number(data.costUsd) || 0),
    Math.min(1, (Number(data.latencyMs) || 0) / 60000),
    data.local === true ? 1 : 0
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

async function observe(db, input) {
  try {
    const data = input || {};
    if (!db || typeof data.routeUri !== 'string' || !data.routeUri) return null;
    const store = new AdaptiveStateService(db);
    const stored = (await store.restoreObject(SCOPE, 'linucb')) || {};
    const arms = stored.arms && typeof stored.arms === 'object' ? stored.arms : {};
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
    const stored = (await store.restoreObject(SCOPE, 'linucb')) || {};
    const arms = stored.arms && typeof stored.arms === 'object' ? stored.arms : {};
    const x = featurize(data);
    const scored = routes.map((uri) => {
      const arm = arms[uri] || newArm();
      return { uri, score: armScore(arm, x), pulls: arm.pulls || 0 };
    });
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
      limitation: 'Apprentissage seul : l\'ordonnancement reste au routeur jusqu\'à audit de désaccord.'
    };
  } catch (_) {
    return { arms: [] };
  }
}

module.exports = { observe, recommend, report, DIM, MAX_ARMS };
