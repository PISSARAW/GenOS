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
const handoffCompiler = require('./handoff/handoffCompilerService');
const cartographer = require('./cartography/cartographerService');
const findingService = require('./findings/findingService');
const signalEventBus = require('../signalEventBus');
const { migrateDaemonEvents } = require('../../db/migrations/migrateDaemonEvents');
const { migrateDaemonEventPayload } = require('../../db/migrations/migrateDaemonEventPayload');

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
  const stored = await territoryService.getTerritory(bridge.db, { id: event.territoryId });
  if (!stored.found) return { applied: false, reason: 'unknown-territory' };
  if (receptor.cheapUpdate === 'head') return applyHeadUpdate(bridge, event);
  await territoryService.touchObserved(bridge.db, { id: event.territoryId });
  return { applied: true, kind: 'touch' };
}

async function applyHeadUpdate(bridge, event) {
  if (event.headSha) {
    const res = await territoryService.updateHead(bridge.db, { id: event.territoryId, headSha: event.headSha });
    const findings = await findingService.markStaleOnHead(bridge.db, {
      territoryId: event.territoryId, headSha: event.headSha
    });
    const changedFiles = safeChangedFiles(event.payload && event.payload.changedFiles);
    let refresh = { refreshed: false, reason: 'root-unavailable' };
    if (changedFiles && event.rootPath && changedFiles.length) {
      try {
        const result = await cartographer.updateFiles(bridge.db, {
          territoryId: event.territoryId, rootPath: event.rootPath, files: changedFiles
        });
        refresh = { refreshed: true, ...result };
      } catch (_) {
        refresh = { refreshed: false, reason: 'refresh-failed' };
      }
    } else if (changedFiles && changedFiles.length === 0) {
      refresh = { refreshed: true, invalidated: 0, reindexed: 0 };
    } else if (!changedFiles) {
      refresh = { refreshed: false, reason: 'changed-files-unavailable' };
    }
    return { applied: true, kind: 'head', ...res, findings, refresh };
  }
  await territoryService.touchObserved(bridge.db, { id: event.territoryId });
  return { applied: true, kind: 'touch' };
}

function safeChangedFiles(files) {
  if (!Array.isArray(files) || files.length > 200) return null;
  const safe = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.@/-]{1,240}$/;
  return files.every((path) => typeof path === 'string' && safe.test(path)) ? files : null;
}

async function maybeWakeRuntime(bridge, event, receptor) {
  if (!bridge.runtime || !bridge.daemonId) {
    return { woke: false, reason: 'daemon-runtime-unattached' };
  }
  const ask = {
    territoryId: event.territoryId,
    eventType: event.type,
    priority: receptor.priority,
    now: event.now || Date.now()
  };
  const decision = wakePolicyService.shouldWake(bridge.policy, ask);
  if (!decision.woke) return decision;
  let heartbeat;
  try {
    heartbeat = await daemonRuntime.heartbeat(bridge.runtime, {
      daemonId: bridge.daemonId,
      activity: receptor.wakeActivity
    });
  } catch (error) {
    wakePolicyService.releaseWake(bridge.policy, ask);
    throw error;
  }
  if (!heartbeat.updated) {
    wakePolicyService.releaseWake(bridge.policy, ask);
    return { woke: false, reason: 'daemon-runtime-update-failed' };
  }
  return decision;
}

async function processPersistedEvent(bridge, event) {
  const receptor = receptorRegistry.getReceptorFor(event.event_type);
  if (!receptor || Number(event.woke) === 1) return { processed: true, woke: false };
  const wake = await maybeWakeRuntime(bridge, {
    territoryId: event.territory_id,
    type: event.event_type,
    priority: event.priority || receptor.priority,
    headSha: event.head_sha || null,
    payload: parseEventPayload(event.payload_json),
    now: Date.now()
  }, receptor);
  if (wake.woke && bridge.db) {
    await bridge.db.run('UPDATE daemon_events SET woke = 1 WHERE id = ?', event.id);
  }
  return { processed: true, woke: wake.woke, reason: wake.reason };
}

function parseEventPayload(raw) {
  try {
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}
  return { processed: true, woke: wake.woke, reason: wake.reason };
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
  let handoffSignal = null;
  let handoffError = null;
  if (receptor.handoffRequested && bridge.db) {
    try {
      const result = await handoffCompiler.compileBrief(bridge.db, {
        territoryId: event.territoryId,
        mission: event.payload && event.payload.mission
      });
      if (result.compiled && result.signal) {
        signalEventBus.publish(result.signal);
        handoffSignal = result.signal;
      } else {
        handoffError = result.reason || 'brief-not-compiled';
      }
    } catch (error) {
      handoffError = (error && error.message) || 'handoff-failed';
    }
  }
  const wake = await maybeWakeRuntime(bridge, event, receptor);
  const logged = await logIngestedEvent(bridge, event, { receptor, wake });
  return {
    ingested: true,
    eventType: event.type,
    territoryId: event.territoryId,
    priority: receptor.priority,
    cheapUpdate: cheap,
    woke: wake.woke,
    wakeReason: wake.reason,
    llmRequired: false,
    handoffRequested: receptor.handoffRequested === true,
    handoffSignal,
    handoffError,
    logged
  };
}

async function logIngestedEvent(bridge, event, outcome) {
  if (!bridge.db) return false;
  const { receptor, wake } = outcome || {};
  if (!receptor || !wake) return false;
  try {
    await migrateDaemonEvents(bridge.db);
    await migrateDaemonEventPayload(bridge.db);
    await bridge.db.run(
      `INSERT INTO daemon_events (territory_id, event_type, priority, woke, handoff_requested, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      event.territoryId,
      event.type,
      receptor.priority,
      wake.woke ? 1 : 0,
      receptor.handoffRequested === true ? 1 : 0,
      JSON.stringify(event.payload || {})
    );
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  createBridge,
  ingestEvent,
  processPersistedEvent,
  validateBridgeEvent
};
