/**
 * Strategy adaptation budget: remaining budget, exhaustion rule, and the
 * fallback cooldown that keeps post-failure adaptation live without flapping.
 */

const FALLBACK_COOLDOWN_MS = 60000;
const MAX_COOLDOWN_ENTRIES = 1000;
const BUDGET_KEYS = ['tokens', 'costUsd', 'latencyMs', 'events'];

const fallbackCooldowns = new Map();

function consumedFor(run, key, now) {
  if (key === 'latencyMs' && run.startedAt) {
    return Math.max(Number(run.metrics?.latencyMs || 0), now - new Date(run.startedAt).getTime());
  }
  return Number(run.metrics?.[key] || 0);
}

function remainingBudget(run, now = Date.now()) {
  if (!run) return null;
  const remaining = {};
  for (const key of BUDGET_KEYS) {
    remaining[key] = Math.max(0, Number(run.budget?.[key] || 0) - consumedFor(run, key, now));
  }
  return remaining;
}

function isBudgetExhausted(budget) {
  if (!budget) return false;
  return Object.values(budget).some((value) => value <= 0);
}

function pruneFallbackCooldowns(now) {
  for (const [id, at] of fallbackCooldowns) {
    if (now - at >= FALLBACK_COOLDOWN_MS) fallbackCooldowns.delete(id);
  }
}

function checkFallbackCooldown(orchestratorId, now = Date.now()) {
  if (fallbackCooldowns.size >= MAX_COOLDOWN_ENTRIES) pruneFallbackCooldowns(now);
  const last = fallbackCooldowns.get(orchestratorId);
  if (last !== undefined && now - last < FALLBACK_COOLDOWN_MS) {
    return { allowed: false, retryAfterMs: FALLBACK_COOLDOWN_MS - (now - last) };
  }
  fallbackCooldowns.set(orchestratorId, now);
  return { allowed: true, retryAfterMs: 0 };
}

module.exports = {
  FALLBACK_COOLDOWN_MS,
  remainingBudget,
  isBudgetExhausted,
  checkFallbackCooldown
};
