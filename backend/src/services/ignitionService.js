'use strict';

/**
 * Ignition à seuil (GWT — integrate-and-fire par agent).
 *
 * La diffusion actuelle est linéaire : tout événement se propage pareil.
 * Ici chaque événement charge un accumulateur à fuite ; sous le seuil le
 * traitement reste local (atténué × 0.9), au seuil un burst non-linéaire
 * amplifie (× 1.5) puis remise à zéro + période réfractaire (× 0.8).
 * Consommateur : captureService (saillance), combiné multiplicativement
 * avec l'atténuation de réafférence. charge() ne lève jamais.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'ignition';
const DEFAULT_THRESHOLD = 1.0;
const DEFAULT_REFRACTORY_MS = 5000;
const LEAK_PER_MS = 1 / 60000;
const BURST_FACTOR = 1.5;
const LOCAL_FACTOR = 0.9;
const REFRACTORY_FACTOR = 0.8;

async function openDb(handle) {
  if (handle && typeof handle.get === 'function') return { db: handle, close: null };
  const { getDatabase } = require('./db');
  const db = await getDatabase();
  return { db, close: () => require('./db').closeDatabase().catch(() => {}) };
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

async function charge(db, agentId, input) {
  const idle = { ignited: false, suppressed: false, charge: 0, ignitions: 0 };
  if (!agentId) return idle;
  const options = input || {};
  const threshold = finiteOr(options.threshold, DEFAULT_THRESHOLD);
  const refractory = finiteOr(options.refractoryMs, DEFAULT_REFRACTORY_MS);
  const now = Number(options.now || Date.now());
  let opened = null;
  try {
    opened = await openDb(db);
    const store = new AdaptiveStateService(opened.db);
    const stored = (await store.restoreObject(SCOPE, agentId)) || {};
    const elapsed = Math.max(0, now - (Number(stored.updatedAt) || now));
    const state = {
      charge: Math.max(0, (Number(stored.charge) || 0) - elapsed * LEAK_PER_MS),
      ignitions: Math.max(0, Math.floor(Number(stored.ignitions) || 0)),
      refractoryUntil: Number(stored.refractoryUntil) || 0,
      updatedAt: now
    };
    if (now < state.refractoryUntil) {
      await store.persistObject(SCOPE, agentId, state, state.ignitions);
      return { ...idle, suppressed: true, charge: state.charge, ignitions: state.ignitions };
    }
    state.charge += clamp01(options.weight);
    if (state.charge >= threshold) {
      state.charge = 0;
      state.ignitions += 1;
      state.refractoryUntil = now + refractory;
      await store.persistObject(SCOPE, agentId, state, state.ignitions);
      return { ignited: true, suppressed: false, charge: 0, ignitions: state.ignitions };
    }
    await store.persistObject(SCOPE, agentId, state, state.ignitions);
    return { ignited: false, suppressed: false, charge: state.charge, ignitions: state.ignitions };
  } catch (_) {
    return idle;
  } finally {
    if (opened && opened.close) await opened.close();
  }
}

function driveInput(candidate, weights) {
  const drives = candidate.drives || {};
  let total = 0;
  for (const key of Object.keys(drives)) {
    const weight = Number(weights[key]);
    total += (Number.isFinite(weight) ? weight : 1) * Math.max(0, Math.min(1, Number(drives[key]) || 0));
  }
  return total;
}

function competeWinners(candidates, options) {
  const settings = options || {};
  const rounds = Math.max(1, Math.min(5, Math.floor(Number(settings.rounds) || 3)));
  const inhibition = Math.max(0, Math.min(1, Number(settings.inhibition ?? 0.2)));
  const margin = Math.max(0, Number(settings.margin ?? 0.15));
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return { winners: [], activations: {}, rounds: 0 };
  const weights = settings.weights && typeof settings.weights === 'object' ? settings.weights : {};
  let activations = Object.fromEntries(list.map((candidate) => [candidate.id, driveInput(candidate, weights)]));
  for (let round = 0; round < rounds; round++) {
    const total = Object.values(activations).reduce((sum, value) => sum + value, 0);
    const next = {};
    for (const candidate of list) {
      next[candidate.id] = Math.max(0, activations[candidate.id] + driveInput(candidate, weights) - inhibition * (total - activations[candidate.id]));
    }
    activations = next;
  }
  const ranked = [...list].sort((a, b) => activations[b.id] - activations[a.id]);
  const top = activations[ranked[0].id];
  const winners = ranked.filter((candidate) => top - activations[candidate.id] <= margin).map((candidate) => candidate.id);
  const rounded = {};
  for (const id of Object.keys(activations)) rounded[id] = Math.round(activations[id] * 1000) / 1000;
  return { winners, activations: rounded, rounds };
}

module.exports = { charge, competeWinners, BURST_FACTOR, LOCAL_FACTOR, REFRACTORY_FACTOR, DEFAULT_THRESHOLD };
