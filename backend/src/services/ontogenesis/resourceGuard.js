'use strict';

const { sampleMemory, classifyLevel, DEFAULT_THRESHOLDS } = require('./memoryPressure');
const { getSpend } = require('./ledgerService');
const { reservedBudgets } = require('./executionStore');

function remainingBudget(config, spent, reserved) {
  const budget = config.budgets || {};
  return Object.fromEntries(['tokens', 'usd', 'seconds'].map((key) => [key, Math.max(0, Number(budget[key] || 0) - spent[key] - reserved[key])]));
}

function usableBudget(budget) {
  return budget.tokens > 0 && budget.usd >= 0 && budget.seconds > 0;
}

async function budgetState(db, ctx) {
  const spent = await getSpend(db, ctx.project.id);
  const reserved = await reservedBudgets(db, ctx.project.id);
  const remaining = remainingBudget(ctx.config, spent, reserved);
  return { remaining, budgetsOk: usableBudget(remaining) };
}

async function memoryState(db, ctx, harness) {
  const previous = await db.get('SELECT * FROM ontogenesis_pressure WHERE project_id = ?', [ctx.project.id]);
  const measurements = await harness.resources(ctx.project);
  const sample = measurements.sample || sampleMemory({ reservationsMb: measurements.reservationsMb || 0 });
  const memory = ctx.config.memory || {};
  let level = classifyLevel(sample, { reserveMb: memory.reserveMb, previous: previous && previous.level });
  if (ctx.project.state === 'SLEEPING_RESOURCE' && sample.freePct < DEFAULT_THRESHOLDS.recoverPct) level = 'critical';
  if (measurements.ownedMb >= memory.envelopeMb) level = 'critical';
  const healthySince = recoverySince(level, previous);
  await db.run(`INSERT INTO ontogenesis_pressure (project_id, level, healthy_since) VALUES (?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET level = excluded.level, healthy_since = excluded.healthy_since`, [ctx.project.id, level, healthySince]);
  return { memoryLevel: level, memoryStable: isStable(memory, healthySince),
    ownedMb: measurements.ownedMb, sample };
}

function recoverySince(level, previous) {
  if (level !== 'normal') return null;
  return (previous && previous.healthy_since) || Date.now();
}

function isStable(memory, healthySince) {
  const stableMs = memory.recoveryStableMs === undefined ? 10000 : memory.recoveryStableMs;
  return healthySince !== null && Date.now() - healthySince >= stableMs;
}

function reservationFor(ctx) {
  const memory = ctx.config.memory;
  return Math.min(memory.workerEstimateMb || 512, memory.envelopeMb);
}

module.exports = { budgetState, memoryState, remainingBudget, usableBudget, reservationFor };
