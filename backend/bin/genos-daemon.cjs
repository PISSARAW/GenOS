#!/usr/bin/env node
'use strict';

/**
 * GenOS Resident Daemon Host CLI (ADR 0034 D2/D3).
 *
 * Bootstraps DB, registers daemon in residentDaemonRuntime,
 * installs signal subscriptions (TERRITORY_FILE_CHANGED,
 * TERRITORY_COMMIT, ORCHESTRATOR_ENTERED, KNOWLEDGE_STALE),
 * polls persisted territory events across process boundaries,
 * and shuts down gracefully on SIGINT/SIGTERM.
 *
 * Usage: genos-daemon.cjs --territory <id> --daemon-id <id>
 */

const { getDatabase, closeDatabase } = require('../src/db');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const runtimeService = require('../src/services/daemon/residentDaemonRuntime');
const eventBridge = require('../src/services/daemon/daemonEventBridgeService');
const eventConsumer = require('../src/services/daemon/daemonEventConsumerService');
const receptorRegistry = require('../src/services/daemon/daemonReceptorRegistry');
const signalEventBus = require('../src/services/signalEventBus');

const SUBSCRIBED_SIGNALS = receptorRegistry.listDaemonEvents();

const DEFAULT_HEARTBEAT_MS = 30000;
const DEFAULT_EVENT_POLL_MS = 1000;

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { territoryId: null, daemonId: null };
  const ti = args.indexOf('--territory');
  const di = args.indexOf('--daemon-id');
  if (ti >= 0) out.territoryId = args[ti + 1];
  if (di >= 0) out.daemonId = args[di + 1];
  return out;
}

function eventFromSignal(signal, defaultTerritoryId) {
  const data = signal && signal.signalData;
  if (!data || !SUBSCRIBED_SIGNALS.includes(data.eventType)) return null;
  return {
    type: data.eventType,
    territoryId: data.territoryId || defaultTerritoryId,
    headSha: data.headSha,
    payload: data.payload || {}
  };
}

function createResidentRuntime(db) {
  return runtimeService.createRuntime(db);
}

function subscribeToSignals(bridge, territoryId) {
  const listener = (signal) => {
    const event = eventFromSignal(signal, territoryId);
    if (event) eventBridge.ingestEvent(bridge, event).catch(() => {});
  };
  signalEventBus.onSignal(listener);
  return () => signalEventBus.off('signal', listener);
}

function startHeartbeatTimer(runtime, daemonId, intervalMs) {
  const timer = setInterval(() => {
    runtimeService.heartbeat(runtime, { daemonId }).catch(() => {});
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

function startEventPollTimer(context, intervalMs) {
  let polling = false;
  let pollHealth = context.runtime.daemons.get(context.daemonId)?.health || 'HEALTHY';
  const timer = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      await eventConsumer.pollDaemonEvents(context);
      if (await updatePollHealth(context, 'HEALTHY', pollHealth)) pollHealth = 'HEALTHY';
    } catch (error) {
      process.stderr.write(`[genos-daemon] Event poll failed: ${error.message}\n`);
      if (await updatePollHealth(context, 'DEGRADED', pollHealth)) pollHealth = 'DEGRADED';
    } finally {
      polling = false;
    }
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

async function updatePollHealth(context, health, previousHealth) {
  if (health === previousHealth) return true;
  try {
    const result = await runtimeService.heartbeat(context.runtime, { daemonId: context.daemonId, health });
    return result.updated === true;
  } catch (_) { return false; /* the next poll retries the health transition */ }
}

async function resolveRegisteredTerritory(db, territoryId) {
  const result = await territoryService.getTerritory(db, { id: territoryId });
  return result.found ? result.territory : null;
}

async function assertHostDaemonRegistered(runtime, input) {
  const result = await runtimeService.registerDaemon(runtime, input);
  if (!result.registered) {
    const reason = (result.errors || ['registration-rejected']).join(', ');
    throw Object.assign(new Error(`Resident daemon registration failed: ${reason}`), { code: 'DAEMON_REGISTRATION_FAILED' });
  }
  return result;
}

async function shutdown(ctx) {
  if (ctx.unsubscribeSignals) ctx.unsubscribeSignals();
  if (ctx.heartbeatTimer) clearInterval(ctx.heartbeatTimer);
  if (ctx.eventPollTimer) clearInterval(ctx.eventPollTimer);
  await closeDatabase().catch(() => {});
  console.log(`[genos-daemon] ${ctx.daemonId} shutdown complete.`);
}

async function main() {
  const flags = parseArgs(process.argv);
  if (!flags.territoryId || !flags.daemonId) {
    process.stderr.write('Usage: genos-daemon.cjs --territory <id> --daemon-id <id>\n');
    process.exit(2);
  }

  const db = await getDatabase();
  await migrateDaemonEvents(db);
  const territory = await resolveRegisteredTerritory(db, flags.territoryId);
  if (!territory) throw new Error(`Territory ${flags.territoryId} is not registered; register it before starting the daemon.`);

  const runtime = createResidentRuntime(db);
  await assertHostDaemonRegistered(runtime, {
    daemonId: flags.daemonId,
    territoryId: flags.territoryId,
    activity: 'BOOTSTRAPPING'
  });

  const bridge = eventBridge.createBridge({ db, runtime, daemonId: flags.daemonId });
  const eventContext = {
    db, runtime, bridge, daemonId: flags.daemonId, territoryId: flags.territoryId
  };
  await eventConsumer.initializeCursor(eventContext);
  const unsubscribeSignals = subscribeToSignals(bridge, flags.territoryId);
  const heartbeatTimer = startHeartbeatTimer(runtime, flags.daemonId, DEFAULT_HEARTBEAT_MS);
  const eventPollTimer = startEventPollTimer(eventContext, DEFAULT_EVENT_POLL_MS);

  const ctx = { db, runtime, bridge, unsubscribeSignals, heartbeatTimer, eventPollTimer, daemonId: flags.daemonId };
  console.log(`[genos-daemon] ${flags.daemonId} active on ${flags.territoryId}. Signals: ${SUBSCRIBED_SIGNALS.join(', ')}. Event poll: ${DEFAULT_EVENT_POLL_MS}ms.`);

  const stop = () => { shutdown(ctx).then(() => process.exit(0)).catch(() => process.exit(1)); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[genos-daemon] Fatal: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  resolveRegisteredTerritory, createResidentRuntime, eventFromSignal,
  subscribeToSignals, assertHostDaemonRegistered
};
