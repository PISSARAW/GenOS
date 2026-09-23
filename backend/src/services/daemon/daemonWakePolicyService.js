'use strict';

/**
 * Daemon Wake Policy — ADR 0034 D3.
 *
 * Décide si un événement mérite de réveiller le daemon (FOCUSED)
 * ou reste en persistence silencieuse. Guards :
 *  - low priority → jamais de wake (persistence only) ;
 *  - cooldown par (territoire, eventType) contre les rafales ;
 *  - budget max de wakes par territoire et par fenêtre (anti tempête).
 *
 * Pur et déterministe : le temps est injecté (now), aucun LLM.
 */

const DEFAULT_COOLDOWN_MS = 5000;
const DEFAULT_MAX_WAKES = 10;
const DEFAULT_WINDOW_MS = 60000;

function createWakePolicy(options) {
  const opts = options || {};
  return {
    cooldownMs: opts.cooldownMs || DEFAULT_COOLDOWN_MS,
    maxWakes: opts.maxWakes || DEFAULT_MAX_WAKES,
    windowMs: opts.windowMs || DEFAULT_WINDOW_MS,
    lastWakeByKey: new Map(),
    wakeStampsByTerritory: new Map()
  };
}

function policyKey(territoryId, eventType) {
  return `${territoryId}::${eventType}`;
}

function pruneStamps(policy, territoryId, now) {
  const stamps = policy.wakeStampsByTerritory.get(territoryId) || [];
  const cutoff = now - policy.windowMs;
  const kept = stamps.filter((t) => t >= cutoff);
  policy.wakeStampsByTerritory.set(territoryId, kept);
  return kept;
}

/**
 * @param {object} policy créée par createWakePolicy
 * @param {object} ask { territoryId, eventType, priority, now? }
 */
function shouldWake(policy, ask) {
  if (!policy || !ask || !ask.territoryId || !ask.eventType) return { woke: false, reason: 'invalid-ask' };
  if (ask.priority === 'low') return { woke: false, reason: 'low-priority-persist-only' };
  const now = ask.now || Date.now();
  const key = policyKey(ask.territoryId, ask.eventType);
  const last = policy.lastWakeByKey.get(key);
  if (last !== undefined && now - last < policy.cooldownMs) return { woke: false, reason: 'cooldown' };
  const stamps = pruneStamps(policy, ask.territoryId, now);
  if (stamps.length >= policy.maxWakes) return { woke: false, reason: 'wake-budget-exhausted' };
  policy.lastWakeByKey.set(key, now);
  stamps.push(now);
  policy.wakeStampsByTerritory.set(ask.territoryId, stamps);
  return { woke: true, reason: 'policy-allow' };
}

module.exports = {
  createWakePolicy,
  shouldWake,
  DEFAULT_COOLDOWN_MS,
  DEFAULT_MAX_WAKES,
  DEFAULT_WINDOW_MS
};
