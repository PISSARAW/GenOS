#!/usr/bin/env node
'use strict';

/**
 * GenOS Resident Daemon Host CLI (ADR 0034 D2/D3).
 *
 * Bootstraps DB, registers daemon in residentDaemonRuntime,
 * installs signal subscriptions (TERRITORY_FILE_CHANGED,
 * TERRITORY_COMMIT, ORCHESTRATOR_ENTERED, KNOWLEDGE_STALE),
 * starts a 60s fallback timer emitting KNOWLEDGE_STALE,
 * and shuts down gracefully on SIGINT/SIGTERM.
 *
 * Usage: genos-daemon.cjs --territory <id> --daemon-id <id>
 */

const { getDatabase, closeDatabase } = require('../src/db');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const runtimeService = require('../src/services/daemon/residentDaemonRuntime');
const eventBridge = require('../src/services/daemon/daemonEventBridgeService');
const signalEventBus = require('../src/services/signalEventBus');

const SUBSCRIBED_SIGNALS = [
  'TERRITORY_FILE_CHANGED',
  'TERRITORY_COMMIT',
  'ORCHESTRATOR_ENTERED',
  'KNOWLEDGE_STALE'
];

const DEFAULT_FALLBACK_MS = 60000;
const DEFAULT_HEARTBEAT_MS = 30000;

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

function startFallbackTimer(bridge, territoryId, intervalMs) {
  const timer = setInterval(() => {
    eventBridge.ingestEvent(bridge, { type: 'KNOWLEDGE_STALE', territoryId });
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

function startHeartbeatTimer(runtime, daemonId, intervalMs) {
  const timer = setInterval(() => {
    runtimeService.heartbeat(runtime, { daemonId }).catch(() => {});
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

async function resolveRegisteredTerritory(db, territoryId) {
  const result = await territoryService.getTerritory(db, { id: territoryId });
  return result.found ? result.territory : null;
}

async function shutdown(ctx) {
  if (ctx.unsubscribeSignals) ctx.unsubscribeSignals();
  if (ctx.fallbackTimer) clearInterval(ctx.fallbackTimer);
  if (ctx.heartbeatTimer) clearInterval(ctx.heartbeatTimer);
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
  const territory = await resolveRegisteredTerritory(db, flags.territoryId);
  if (!territory) throw new Error(`Territory ${flags.territoryId} is not registered; register it before starting the daemon.`);

  const runtime = createResidentRuntime(db);
  await runtimeService.registerDaemon(runtime, {
    daemonId: flags.daemonId,
    territoryId: flags.territoryId,
    activity: 'BOOTSTRAPPING'
  });

  const bridge = eventBridge.createBridge({ db, runtime, daemonId: flags.daemonId });
  const unsubscribeSignals = subscribeToSignals(bridge, flags.territoryId);
  const fallbackTimer = startFallbackTimer(bridge, flags.territoryId, DEFAULT_FALLBACK_MS);
  const heartbeatTimer = startHeartbeatTimer(runtime, flags.daemonId, DEFAULT_HEARTBEAT_MS);

  const ctx = { db, runtime, bridge, unsubscribeSignals, fallbackTimer, heartbeatTimer, daemonId: flags.daemonId };
  console.log(`[genos-daemon] ${flags.daemonId} active on ${flags.territoryId}. Signals: ${SUBSCRIBED_SIGNALS.join(', ')}. Fallback: ${DEFAULT_FALLBACK_MS}ms.`);

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

module.exports = { resolveRegisteredTerritory, createResidentRuntime, eventFromSignal, subscribeToSignals };
