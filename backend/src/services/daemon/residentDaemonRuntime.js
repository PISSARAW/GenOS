'use strict';

/**
 * ResidentDaemonRuntime — ADR 0034 D2.
 *
 * Host minimal du daemon résident : registre en mémoire + persistance
 * daemon_runtime_state. Aucune logique cognitive ici ( sensing,
 * cartographie, investigation arrivent en D3-D8 ). Le runtime :
 *  - enregistre un daemon lié à un territoire ;
 *  - expose des transitions d'activité déterministes ;
 *  - persiste heartbeat / santé ;
 *  - compte les révisions cognitives Hayflick (mutations coûteuses,
 *    pas des ticks).
 *
 * Invariants : observation seule, dégradation gracieuse (pas de
 * throw sur heartbeat manquant), autorité jamais élargie ici.
 */

const { migrateDaemonTerritory } = require('../../db/migrations/migrateDaemonTerritory');

const ACTIVITIES = [
  'BOOTSTRAPPING',
  'SURVEYING',
  'DORMANT',
  'FOCUSED',
  'INVESTIGATING',
  'VERIFYING',
  'REPORTING'
];

const HEALTHS = ['HEALTHY', 'STRESSED', 'DEGRADED', 'SENESCENT', 'APOPTOTIC'];

const TRANSITIONS = {
  BOOTSTRAPPING: { surveyed: 'SURVEYING' },
  SURVEYING: { complete: 'DORMANT' },
  DORMANT: { signal: 'FOCUSED' },
  FOCUSED: { investigate: 'INVESTIGATING' },
  INVESTIGATING: { verify: 'VERIFYING' },
  VERIFYING: { report: 'REPORTING' },
  REPORTING: { done: 'DORMANT' }
};

const GENOME_REF = 'agents/daemons/resident_daemon.agent.json';

function transitionActivity(current, event) {
  const next = (TRANSITIONS[current] || {})[event] || null;
  return next;
}

function isValidActivity(value) {
  return ACTIVITIES.includes(value);
}

function isValidHealth(value) {
  return HEALTHS.includes(value);
}

function createRuntime(db, options) {
  return {
    db: db || null,
    genomeRef: (options && options.genomeRef) || GENOME_REF,
    daemons: new Map(),
    started: false
  };
}

async function ensureRuntimeTables(runtime) {
  if (!runtime.db) return;
  await migrateDaemonTerritory(runtime.db);
}

async function registerDaemon(runtime, input) {
  if (!runtime || !input || !input.daemonId || !input.territoryId) return { registered: false };
  await ensureRuntimeTables(runtime);
  const activity = isValidActivity(input.activity) ? input.activity : 'BOOTSTRAPPING';
  const health = isValidHealth(input.health) ? input.health : 'HEALTHY';
  if (runtime.db) {
    await runtime.db.run(
      `INSERT INTO daemon_runtime_state (daemon_id, territory_id, activity, health, cognitive_revisions)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(daemon_id) DO UPDATE SET territory_id = excluded.territory_id`,
      input.daemonId,
      input.territoryId,
      activity,
      health
    );
  }
  runtime.daemons.set(input.daemonId, { territoryId: input.territoryId, activity, health, revisions: 0 });
  return { registered: true, daemonId: input.daemonId, activity, health };
}

async function heartbeat(runtime, tick) {
  if (!runtime || !tick || !tick.daemonId) return { updated: false };
  const entry = runtime.daemons.get(tick.daemonId);
  if (!entry) return { updated: false, errors: ['unknown-daemon'] };
  applyTickToEntry(entry, tick);
  await persistHeartbeat(runtime, tick, entry);
  return { updated: true, activity: entry.activity, health: entry.health, revisions: entry.revisions };
}

function applyTickToEntry(entry, tick) {
  if (isValidActivity(tick.activity)) entry.activity = tick.activity;
  if (isValidHealth(tick.health)) entry.health = tick.health;
  if (tick.revision === true) entry.revisions += 1;
}

async function persistHeartbeat(runtime, tick, entry) {
  if (!runtime.db) return;
  await runtime.db.run(
    `UPDATE daemon_runtime_state
     SET activity = ?, health = ?,
         cognitive_revisions = cognitive_revisions + ?,
         last_heartbeat_at = datetime('now'), updated_at = datetime('now')
     WHERE daemon_id = ?`,
    entry.activity,
    entry.health,
    tick.revision === true ? 1 : 0,
    tick.daemonId
  );
}

async function getDaemonState(runtime, query) {
  if (!runtime || !query || !query.daemonId) return { found: false };
  const entry = runtime.daemons.get(query.daemonId);
  if (entry) return { found: true, source: 'memory', daemonId: query.daemonId, ...entry };
  if (!runtime.db) return { found: false };
  const row = await runtime.db.get('SELECT * FROM daemon_runtime_state WHERE daemon_id = ?', query.daemonId);
  if (!row) return { found: false };
  return {
    found: true,
    source: 'sqlite',
    daemonId: row.daemon_id,
    territoryId: row.territory_id,
    activity: row.activity,
    health: row.health,
    revisions: row.cognitive_revisions
  };
}

module.exports = {
  ACTIVITIES,
  HEALTHS,
  TRANSITIONS,
  GENOME_REF,
  transitionActivity,
  createRuntime,
  registerDaemon,
  heartbeat,
  getDaemonState
};
