'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');

const METRICS = ['tokens', 'usd', 'latencyMs'];
const COLUMNS = { tokens: 'tokens', usd: 'usd', latencyMs: 'latency_ms' };

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_action_decisions (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, mission_id TEXT NOT NULL,
    action_id TEXT, mode TEXT NOT NULL, status TEXT NOT NULL,
    tokens REAL NOT NULL DEFAULT 0, usd REAL NOT NULL DEFAULT 0,
    latency_ms REAL NOT NULL DEFAULT 0, journal_json TEXT NOT NULL,
    result_digest TEXT, created_at TEXT NOT NULL, closed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_mission_action_decisions_run
    ON mission_action_decisions(run_id, status);`);
}

function amount(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
}

function available(row, usage) {
  const limit = JSON.parse(row.budget_json);
  const spent = JSON.parse(row.metrics_json);
  const budget = { tokens: limit.tokens, usd: limit.costUsd, latencyMs: limit.latencyMs };
  const metrics = { tokens: spent.tokens, usd: spent.costUsd, latencyMs: spent.latencyMs };
  if (METRICS.some((metric) => !Number.isFinite(budget[metric]) || budget[metric] < 0)) {
    throw new Error('Mission run has no finite complete budget.');
  }
  return Object.fromEntries(METRICS.map((metric) => [metric,
    Math.max(0, budget[metric] - amount(metrics[metric]) - amount(usage[COLUMNS[metric]]))]));
}

async function usageFor(db, runId) {
  return db.get(`SELECT COALESCE(SUM(tokens), 0) AS tokens,
    COALESCE(SUM(usd), 0) AS usd,
    COALESCE(SUM(latency_ms), 0) AS latency_ms
    FROM mission_action_decisions WHERE run_id = ? AND mode = 'active'`, runId);
}

async function budgetFor(db, row) {
  await ensure(db);
  return available(row, await usageFor(db, row.id));
}

function entryOf(input, mode, quote) {
  return { id: crypto.randomUUID(), runId: input.runId, missionId: input.missionId,
    actionId: input.decision.selectedId, mode, status: mode === 'active' ? 'reserved' : 'shadow',
    quote: quote?.reservationRequired || { tokens: 0, usd: 0, latencyMs: 0 },
    journal: input.decision.journal };
}

async function insert(db, entry) {
  await db.run(`INSERT INTO mission_action_decisions
    (id, run_id, mission_id, action_id, mode, status, tokens, usd, latency_ms,
     journal_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  entry.id, entry.runId, entry.missionId, entry.actionId, entry.mode, entry.status,
  entry.quote.tokens, entry.quote.usd, entry.quote.latencyMs,
  JSON.stringify(entry.journal), new Date().toISOString());
  return entry;
}

async function recordShadow(db, input) {
  await ensure(db);
  return insert(db, entryOf(input, 'shadow'));
}

async function reserve(db, input) {
  await ensure(db);
  return withTransaction(db, async () => {
    const row = await db.get('SELECT budget_json, metrics_json FROM strategy_execution_runs WHERE id = ?', input.runId);
    if (!row) throw new Error('Mission run disappeared before action reservation.');
    const usage = await usageFor(db, input.runId);
    const current = available(row, usage);
    const quote = input.quote.reservationRequired;
    if (METRICS.some((metric) => quote[metric] > current[metric])) {
      throw Object.assign(new Error('Mission action exceeds remaining run budget.'),
        { code: 'MISSION_ACTION_BUDGET_EXCEEDED' });
    }
    const prior = await db.get(`SELECT id FROM mission_action_decisions
      WHERE run_id = ? AND action_id = ? AND mode = 'active' LIMIT 1`,
    input.runId, input.decision.selectedId);
    if (prior) throw Object.assign(new Error('Mission action already attempted.'),
      { code: 'MISSION_ACTION_DUPLICATE' });
    return insert(db, entryOf(input, 'active', input.quote));
  });
}

async function finish(db, entry, result) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  await db.run(`UPDATE mission_action_decisions SET status = ?, result_digest = ?, closed_at = ?
    WHERE id = ? AND status = 'reserved'`, result.status, `sha256:${digest}`,
  new Date().toISOString(), entry.id);
  return { id: entry.id, status: result.status, resultDigest: `sha256:${digest}` };
}

module.exports = { budgetFor, recordShadow, reserve, finish };
