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
      expectedDetail: typeof prediction.expectedDetail === 'string' ? prediction.expectedDetail.slice(0, 160) : null,
      expectedState: trimState(prediction.expectedState)
    },
    status: 'pending',
    createdAt: now
  };
}

function trimState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (Object.keys(out).length >= 8) break;
    out[String(key).slice(0, 64)] = val;
    if (JSON.stringify(out).length > 2000) {
      delete out[String(key).slice(0, 64)];
      break;
    }
  }
  return Object.keys(out).length ? out : null;
}

function stateMatchRatio(expected, observed) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return null;
  const keys = Object.keys(expected);
  if (!keys.length) return null;
  const actual = observed && typeof observed === 'object' && !Array.isArray(observed) ? observed : {};
  let matched = 0;
  for (const key of keys) {
    if (JSON.stringify(actual[key]) === JSON.stringify(expected[key])) matched += 1;
  }
  return matched / keys.length;
}

function scoreSurprise(predicted, observation) {
  if (observation.success !== true) return 1;
  const data = observation || {};
  const ratio = stateMatchRatio(predicted.expectedState, data.observedState);
  if (ratio !== null) return Math.round((1 - ratio) * 100) / 100;
  if (predicted.expectedDetail && !String(data.detail || '').includes(predicted.expectedDetail)) return 0.25;
  return 0;
}

function pruneTransitions(all) {
  const pending = all.filter((entry) => entry.status === 'pending');
  const resolved = all.filter((entry) => entry.status !== 'pending').slice(-RESOLVED_KEEP);
  return [...pending, ...resolved].slice(-LEDGER_LIMIT);
}

async function loadTransitions(db, agentId) {
  const store = new AdaptiveStateService(db);
  const stored = (await store.restoreObject(SCOPE, agentId)) || {};
  return { store, all: Array.isArray(stored.transitions) ? stored.transitions : [] };
}

async function saveTransitions(store, agentId, all) {
  const current = (await store.restoreObject(SCOPE, agentId)) || {};
  const bounded = pruneTransitions(all);
  await store.persistObject(SCOPE, agentId, { ...current, transitions: bounded }, bounded.length);
  return bounded;
}

async function predictTransition(db, agentId, prediction) {
  if (!agentId || !validPrediction(prediction)) {
    throw new Error('predictTransition requires agentId and a valid prediction');
  }
  let opened = null;
  try {
    opened = await openDb(db);
    const { store, all } = await loadTransitions(opened.db, agentId);
    const bounded = await saveTransitions(store, agentId, [...all, normalizePrediction(prediction, Date.now())]);
    return bounded[bounded.length - 1];
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

function findPending(all, observation) {
  const solo = all.filter((entry) => entry.status === 'pending' && !entry.chainId);
  if (observation.actionId) {
    const exact = solo.find((entry) => entry.actionId === observation.actionId);
    if (exact) return exact;
  }
  return solo.length ? solo[solo.length - 1] : null;
}

async function observeTransition(db, agentId, observation) {
  const data = observation || {};
  const fallback = { matched: false, surprise: data.success === true ? 0 : 1 };
  if (!agentId) return fallback;
  let opened = null;
  try {
    opened = await openDb(db);
    const { store, all } = await loadTransitions(opened.db, agentId);
    const hit = findPending(all, data);
    if (!hit) return fallback;
    const surprise = scoreSurprise(hit.predicted || {}, data);
    const resolved = { ...hit, status: 'resolved', success: data.success === true, surprise, observedAt: new Date().toISOString() };
    await saveTransitions(store, agentId, all.map((entry) => (entry.id === hit.id ? resolved : entry)));
    return { matched: true, transitionId: hit.id, surprise };
  } catch (_) {
    return fallback;
  }
}

const TRAJECTORY_STEPS_MAX = 5;
const UNCERTAINTY_GROWTH = 0.15;
const SAMPLE_LIMIT = 150;
const ROLLOUT_NODES_MAX = 13;

const STATE_KEYS = ['filesChanged', 'testsPassed', 'testsFailed', 'costUsd', 'latencyMs', 'agentsActive', 'evidenceCount'];

function encodeWorldState(input) {
  const data = input && typeof input === 'object' ? input : null;
  if (!data) return null;
  const descriptor = {};
  for (const key of STATE_KEYS) {
    const value = Number(data[key]);
    if (Number.isFinite(value)) descriptor[key] = value;
  }
  if (typeof data.success === 'boolean') descriptor.success = data.success;
  return Object.keys(descriptor).length ? descriptor : null;
}

function deltaKey(delta) {
  return JSON.stringify(delta);
}

function validSample(agentId, data) {
  return !!agentId && typeof data.action === 'string' && !!data.action;
}

async function recordSample(db, agentId, sample) {
  const data = sample || {};
  if (!validSample(agentId, data)) return null;
  const delta = encodeWorldState(data.delta);
  if (!delta) return null;
  let opened = null;
  try {
    opened = await openDb(db);
    const store = new AdaptiveStateService(opened.db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    const samples = Array.isArray(stored.samples) ? stored.samples : [];
    const bounded = [...samples, { action: data.action.slice(0, 120), delta, at: new Date().toISOString() }].slice(-SAMPLE_LIMIT);
    await store.persistObject(SCOPE, agentId, { ...stored, samples: bounded }, bounded.length);
    return { action: data.action.slice(0, 120), samples: bounded.length };
  } catch (_) {
    return null;
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

function sampleDistribution(samples) {
  const counts = {};
  for (const entry of samples) {
    const key = deltaKey(entry.delta);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ delta: JSON.parse(key), p: count / samples.length }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
}

async function predictState(db, agentId, input) {
  const data = input || {};
  if (!validSample(agentId, data)) return null;
  let opened = null;
  try {
    opened = await openDb(db);
    const stored = (await new AdaptiveStateService(opened.db).restoreObject(SCOPE, agentId)) || {};
    const samples = (Array.isArray(stored.samples) ? stored.samples : []).filter((entry) => entry.action === data.action);
    if (!samples.length) return null;
    const distribution = sampleDistribution(samples);
    const withSuccess = samples.filter((entry) => typeof entry.delta.success === 'boolean');
    return {
      action: data.action,
      distribution,
      uncertainty: 1 - distribution[0].p,
      successRate: withSuccess.length ? withSuccess.filter((entry) => entry.delta.success).length / withSuccess.length : null,
      n: samples.length
    };
  } catch (_) {
    return null;
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

async function rolloutChildren(db, agentId, state) {
  const { node, level, actions, frontier } = state;
  for (const action of actions) {
    if (state.total >= ROLLOUT_NODES_MAX) break;
    state.total += 1;
    let predicted = null;
    try {
      predicted = await predictState(db, agentId, { action });
    } catch (_) {}
    const child = { action, predicted, children: [], depth: level + 1 };
    node.children.push(child);
    frontier.push({ node: child, level: level + 1 });
  }
}

async function rolloutFree(db, agentId, input) {
  const data = input || {};
  const actions = Array.isArray(data.actions) ? data.actions.filter((action) => typeof action === 'string') : [];
  const depth = Math.max(1, Math.min(3, Math.floor(Number(data.depth) || 2)));
  if (!agentId || !actions.length) return null;
  const root = { action: null, children: [], depth: 0 };
  const state = { total: 0, actions, frontier: null, node: null, level: 0 };
  const frontier = [{ node: root, level: 0 }];
  state.frontier = frontier;
  while (frontier.length && state.total < ROLLOUT_NODES_MAX) {
    const { node, level } = frontier.shift();
    if (level >= depth) continue;
    state.node = node;
    state.level = level;
    await rolloutChildren(db, agentId, state);
  }
  return root;
}

function trajectoryUncertainty(base, step) {
  return Math.min(0.95, Math.max(0, base) + step * UNCERTAINTY_GROWTH);
}

function validTrajectory(input) {
  const actions = input && Array.isArray(input.actions) ? input.actions : [];
  if (!actions.length || actions.length > TRAJECTORY_STEPS_MAX) return false;
  return actions.every((action) => action && typeof action.action === 'string' && !!action.action.trim());
}

async function predictTrajectory(db, agentId, input) {
  const options = input || {};
  if (!agentId || !validTrajectory(options)) {
    throw new Error('predictTrajectory requires agentId and 1-5 actions');
  }
  let opened = null;
  try {
    opened = await openDb(db);
    const now = Date.now();
    const base = Number.isFinite(Number(options.baseUncertainty)) ? Math.max(0, Math.min(1, Number(options.baseUncertainty))) : 0.3;
    const chainId = String(options.chainId || `traj_${now}_${Math.floor(Math.random() * 0xffff).toString(16)}`);
    const { store, all } = await loadTransitions(opened.db, agentId);
    const steps = options.actions.map((action, step) => ({
      ...normalizePrediction({ actionId: action.actionId || `${chainId}#${step}`, action: action.action, expectedDetail: action.expectedDetail, expectedState: action.expectedState }, now),
      chainId,
      step,
      uncertainty: trajectoryUncertainty(base, step)
    }));
    const bounded = await saveTransitions(store, agentId, [...all, ...steps]);
    void bounded;
    return { chainId, steps: steps.map((entry) => ({ transitionId: entry.id, action: entry.action, uncertainty: entry.uncertainty })) };
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

function resolveTrajectorySteps(pending, outcomes) {
  const surprises = [];
  const resolvedIds = new Set();
  for (let step = 0; step < pending.length && step < outcomes.length; step++) {
    const entry = pending[step];
    const data = outcomes[step] || {};
    const surprise = scoreSurprise(entry.predicted || {}, { success: data.success === true, detail: data.detail, observedState: data.observedState });
    surprises.push(surprise);
    entry.status = 'resolved';
    entry.success = data.success === true;
    entry.surprise = surprise;
    entry.observedAt = new Date().toISOString();
    resolvedIds.add(entry.id);
  }
  return { surprises, resolvedIds };
}

async function observeTrajectory(db, agentId, input) {
  const options = input || {};
  const fallback = { matched: false, surprises: [], meanSurprise: 1, uncertaintyMiscalibration: null };
  if (!agentId || typeof options.chainId !== 'string') return fallback;
  const outcomes = Array.isArray(options.outcomes) ? options.outcomes : [];
  let opened = null;
  try {
    opened = await openDb(db);
    const { store, all } = await loadTransitions(opened.db, agentId);
    const pending = all
      .filter((entry) => entry.status === 'pending' && entry.chainId === options.chainId)
      .sort((a, b) => a.step - b.step);
    if (!pending.length) return fallback;
    const { surprises, resolvedIds } = resolveTrajectorySteps(pending, outcomes);
    if (!resolvedIds.size) return fallback;
    await saveTransitions(store, agentId, all);
    const errors = pending
      .filter((entry) => resolvedIds.has(entry.id))
      .map((entry) => Math.abs(entry.uncertainty - (entry.surprise >= 0.5 ? 1 : 0)));
    const mean = (list) => list.reduce((total, value) => total + value, 0) / list.length;
    return {
      matched: true,
      chainId: options.chainId,
      surprises,
      meanSurprise: mean(surprises),
      uncertaintyMiscalibration: mean(errors)
    };
  } catch (_) {
    return fallback;
  }
}

module.exports = { predictTransition, observeTransition, predictTrajectory, observeTrajectory, encodeWorldState, recordSample, predictState, rolloutFree, SURPRISE_FLAG_AT };
