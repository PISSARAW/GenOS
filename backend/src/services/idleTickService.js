'use strict';

/**
 * Récurrence entretenue hors mission (boucles réverbérantes, DMN-like).
 *
 * tick() = une passe d'entretien strictement bornée, exécutée seulement si
 * l'agent est idle (pas de runtime), solvable (budget cognitif > 0, pas
 * d'apoptose) et hors anti-rebond (60 s). Travail : passe de maintenance
 * réverbérante (fonctions pures, zéro token) + audit des prédictions en
 * attente. Divergence = non-convergence ou registre de prédictions engorgé
 * (≥ 15), 3 fois de suite ⇒ statut 'divergent' (le runtime décide).
 * sweepIdleAgents() borne le balayage (5 agents, budget wall-clock).
 * Déclencheur automatique : finalizeChildClose (fenêtre idle qui s'ouvre).
 * Boucle auto-entretenue sans déclencheur externe = étape suivante
 * (nécessite un scheduler + préemption dédiés, non implémentés ici).
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'idle_tick';
const DEFAULT_BUDGET_MS = 2000;
const MAX_BUDGET_MS = 5000;
const DEFAULT_MIN_INTERVAL_MS = 60000;
const DEFAULT_SWEEP_LIMIT = 5;
const DEFAULT_SWEEP_BUDGET_MS = 30000;
const CLOG_THRESHOLD = 15;
const DIVERGENT_STREAK = 3;

function numOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function shouldTick(db, agentId) {
  if (!db || !agentId) return { idle: false, reason: 'missing agent' };
  try {
    const row = await db.get('SELECT runtime_pid, status, is_apoptotic FROM agents WHERE id = ?', agentId);
    if (!row) return { idle: false, reason: 'unknown agent' };
    if (row.runtime_pid) return { idle: false, reason: 'agent_active' };
    if (row.status === 'running') return { idle: false, reason: 'agent_active' };
    if (row.is_apoptotic) return { idle: false, reason: 'apoptotic' };
    return { idle: true, reason: 'idle' };
  } catch (_) {
    return { idle: false, reason: 'unavailable' };
  }
}

async function budgetOk(db, agentId) {
  try {
    const conscience = require('./agentConscienceService');
    const state = await conscience.loadCognitiveRegulationState(db, agentId);
    if (state.isApoptotic || state.currentBudget <= 0) return false;
    return true;
  } catch (_) {
    return false;
  }
}

async function pendingPredictions(db, agentId) {
  const store = new AdaptiveStateService(db);
  let pending = 0;
  for (const scope of ['efference', 'world_model']) {
    try {
      const stored = (await store.restoreObject(scope, agentId)) || {};
      const list = stored.copies || stored.transitions || [];
      pending += list.filter((entry) => entry.status === 'pending' || entry.consumed === false).length;
    } catch (_) {}
  }
  return pending;
}

async function tickState(store, agentId) {
  const stored = (await store.restoreObject(SCOPE, agentId)) || {};
  return {
    ticks: Math.max(0, Math.floor(Number(stored.ticks) || 0)),
    divergences: Math.max(0, Math.floor(Number(stored.divergences) || 0)),
    lastTick: Number(stored.lastTick) || 0
  };
}

async function tick(db, agentId, options) {
  const settings = options || {};
  const started = Date.now();
  const budgetMs = Math.min(MAX_BUDGET_MS, Math.max(1, numOr(settings.budgetMs, DEFAULT_BUDGET_MS)));
  const minInterval = Math.max(0, numOr(settings.minIntervalMs, DEFAULT_MIN_INTERVAL_MS));
  const guard = await shouldTick(db, agentId);
  if (!guard.idle) return { status: 'skipped', reason: guard.reason, agentId };
  if (!await budgetOk(db, agentId)) return { status: 'skipped', reason: 'no_budget', agentId };
  try {
    const store = new AdaptiveStateService(db);
    const prior = await tickState(store, agentId);
    if (started - prior.lastTick < minInterval) {
      return { status: 'skipped', reason: 'debounce', agentId };
    }
    const reverberation = require('./reverberationService');
    const maintained = await reverberation.reverberate(db, agentId, {});
    const pending = await pendingPredictions(db, agentId);
    const clogged = pending >= CLOG_THRESHOLD;
    const divergences = (!maintained.settled || clogged) ? prior.divergences + 1 : 0;
    const elapsed = Date.now() - started;
    const state = { ticks: prior.ticks + 1, divergences, lastTick: started };
    await store.persistObject(SCOPE, agentId, state, state.ticks);
    const status = divergences >= DIVERGENT_STREAK ? 'divergent' : elapsed > budgetMs ? 'budget_exceeded' : 'ticked';
    return {
      status, agentId,
      ticks: state.ticks,
      divergences,
      settled: maintained.settled,
      passes: maintained.passes,
      activation: Math.round(maintained.activation * 1000) / 1000,
      pendingPredictions: pending,
      elapsedMs: elapsed
    };
  } catch (_) {
    return { status: 'skipped', reason: 'unavailable', agentId };
  }
}

async function sweepIdleAgents(db, options) {
  const settings = options || {};
  const limit = Math.max(1, Math.min(20, Math.floor(Number(settings.limit) || DEFAULT_SWEEP_LIMIT)));
  const deadline = Date.now() + Math.max(1000, Math.min(120000, Number(settings.sweepBudgetMs) || DEFAULT_SWEEP_BUDGET_MS));
  const report = { ticked: 0, skipped: 0, divergent: 0, details: [] };
  try {
    const rows = await db.all(
      `SELECT id FROM agents WHERE runtime_pid IS NULL AND (status IS NULL OR status != 'running') AND COALESCE(is_apoptotic, 0) = 0 LIMIT ?`,
      limit
    );
    for (const row of rows || []) {
      if (Date.now() > deadline) break;
      try {
        const result = await tick(db, row.id, settings);
        report.details.push({ agentId: row.id, status: result.status, reason: result.reason || null });
        if (result.status === 'ticked') report.ticked += 1;
        else if (result.status === 'divergent') report.divergent += 1;
        else report.skipped += 1;
      } catch (_) {
        report.details.push({ agentId: row?.id || null, status: 'skipped', reason: 'unavailable' });
        report.skipped += 1;
      }
    }
  } catch (_) {}
  return report;
}

const DEFAULT_BASE_INTERVAL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_FLOOR_MS = 30 * 1000;
const MAX_INTERVAL_CEILING_MS = 60 * 60 * 1000;

function schedulerSettings(options) {
  const settings = options || {};
  const env = (name, fallback) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    baseMs: env('GENOS_IDLE_TICK_INTERVAL_MS', numOr(settings.baseMs, DEFAULT_BASE_INTERVAL_MS)),
    minMs: env('GENOS_IDLE_TICK_MIN_MS', numOr(settings.minMs, MIN_INTERVAL_FLOOR_MS)),
    maxMs: env('GENOS_IDLE_TICK_MAX_MS', numOr(settings.maxMs, MAX_INTERVAL_CEILING_MS)),
    sweepLimit: Math.max(1, Math.min(20, Math.floor(numOr(settings.limit, DEFAULT_SWEEP_LIMIT)))),
    sweepBudgetMs: numOr(settings.sweepBudgetMs, DEFAULT_SWEEP_BUDGET_MS),
    tickBudgetMs: numOr(settings.budgetMs, DEFAULT_BUDGET_MS)
  };
}

function nextDelay(outcome, settings, current) {
  const result = outcome || {};
  const pressure = (Number(result.ticked) || 0) + 2 * (Number(result.divergent) || 0);
  if (pressure > 0) return Math.max(settings.minMs, Math.floor((current || settings.baseMs) / (1 + pressure)));
  return Math.min(settings.maxMs, Math.floor((current || settings.baseMs) * 1.5));
}

async function runSchedulerCycle(getDb, state, settings) {
  const db = await getDb();
  const outcome = await sweepIdleAgents(db, {
    limit: settings.sweepLimit,
    sweepBudgetMs: settings.sweepBudgetMs,
    budgetMs: settings.tickBudgetMs
  });
  state.cycles += 1;
  state.lastOutcome = { ticked: outcome.ticked, divergent: outcome.divergent, skipped: outcome.skipped };
  state.delayMs = nextDelay(state.lastOutcome, settings, state.delayMs);
}

function startScheduler(getDb, options) {
  const settings = schedulerSettings(options);
  const state = { running: true, sweeping: false, cycles: 0, lastOutcome: null, delayMs: settings.baseMs, timer: null };
  const loop = () => {
    if (!state.running) return;
    if (state.sweeping) {
      state.timer = setTimeout(loop, settings.minMs);
      if (state.timer.unref) state.timer.unref();
      return;
    }
    state.sweeping = true;
    runSchedulerCycle(getDb, state, settings).catch(() => {}).finally(() => {
      state.sweeping = false;
      if (state.running) {
        state.timer = setTimeout(loop, state.delayMs);
        if (state.timer.unref) state.timer.unref();
      }
    });
  };
  state.timer = setTimeout(loop, settings.baseMs);
  if (state.timer.unref) state.timer.unref();
  return {
    state,
    stop: () => {
      state.running = false;
      if (state.timer) clearTimeout(state.timer);
    }
  };
}

module.exports = { tick, shouldTick, sweepIdleAgents, startScheduler, nextDelay, SCOPE };
