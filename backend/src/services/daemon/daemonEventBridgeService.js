'use strict';

/**
 * Daemon Event Bridge — ADR 0034 D3.
 *
 * Pipeline événementiel du ResidentDaemon :
 *   event → validation → receptor (registre) → cheap update
 *   → wake policy → heartbeat runtime si woke.
 *
 * Cheap updates (déterministes, sans LLM) :
 *  - touch : last_observed_at du territoire ;
 *  - head : TERRITORY_COMMIT avec headSha → updateHead (STALE auto).
 *
 * Le timer 60 min reste un filet de sécurité, pas le système
 * nerveux (il appellera ingestEvent avec KNOWLEDGE_STALE).
 */

const receptorRegistry = require('./daemonReceptorRegistry');
const wakePolicyService = require('./daemonWakePolicyService');
const territoryService = require('./daemonTerritoryService');
const daemonRuntime = require('./residentDaemonRuntime');

function createBridge(options) {
  const opts = options || {};
  return {
    db: opts.db || null,
    runtime: opts.runtime || null,
    daemonId: opts.daemonId || null,
    policy: opts.policy || wakePolicyService.createWakePolicy({})
  };
}

function validateBridgeEvent(event) {
  if (!event || typeof event !== 'object') return { ok: false, errors: ['event-object-required'] };
  if (!event.territoryId) return { ok: false, errors: ['territoryId-required'] };
  if (!receptorRegistry.isKnownEvent(event.type)) return { ok: false, errors: ['unknown-event-type'] };
  return { ok: true };
}

async function applyCheapUpdate(bridge, event, receptor) {
  if (!bridge.db) return { applied: false, reason: 'no-db' };
  if (receptor.cheapUpdate === 'head') return applyHeadUpdate(bridge, event);
  await territoryService.touchObserved(bridge.db, { id: event.territoryId });
  return { applied: true, kind: 'touch' };
}

async function applyHeadUpdate(bridge, event) {
  if (event.headSha) {
    const res = await territoryService.updateHead(bridge.db, { id: event.territoryId, headSha: event.headSha });
    return { applied: true, kind: 'head', ...res };
  }
  await territoryService.touchObserved(bridge.db, { id: event.territoryId });
  return { applied: true, kind: 'touch' };
}

async function maybeWakeRuntime(bridge, event, receptor) {
  const decision = wakePolicyService.shouldWake(bridge.policy, {
    territoryId: event.territoryId,
    eventType: event.type,
    priority: receptor.priority,
    now: event.now
  });
  if (!decision.woke) return decision;
  if (bridge.runtime && bridge.daemonId) {
    await daemonRuntime.heartbeat(bridge.runtime, {
      daemonId: bridge.daemonId,
      activity: receptor.wakeActivity,
      health: 'HEALTHY'
    });
  }
  return decision;
}

/**
 * Ingère un événement territorial.
 * @param {object} bridge créé par createBridge
 * @param {object} event { type, territoryId, headSha?, now? }
 */
async function ingestEvent(bridge, event) {
  const validation = validateBridgeEvent(event);
  if (!validation.ok) return { ingested: false, errors: validation.errors };
  const receptor = receptorRegistry.getReceptorFor(event.type);
  const cheap = await applyCheapUpdate(bridge, event, receptor);
  const wake = await maybeWakeRuntime(bridge, event, receptor);
  return {
    ingested: true,
    eventType: event.type,
    territoryId: event.territoryId,
    priority: receptor.priority,
    cheapUpdate: cheap,
    woke: wake.woke,
    wakeReason: wake.reason,
    llmRequired: false,
    handoffRequested: receptor.handoffRequested === true
  };
}

module.exports = {
  createBridge,
  ingestEvent,
  validateBridgeEvent
};
