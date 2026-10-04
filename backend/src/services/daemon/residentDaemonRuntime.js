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
  BOOTSTRAPPING: { surveyed: 'SURVEYING', reset: 'BOOTSTRAPPING' },
  SURVEYING: { complete: 'DORMANT', reset: 'BOOTSTRAPPING' },
  DORMANT: { signal: 'FOCUSED', reset: 'BOOTSTRAPPING' },
  FOCUSED: { investigate: 'INVESTIGATING', cool: 'DORMANT', reset: 'BOOTSTRAPPING' },
  INVESTIGATING: { verify: 'VERIFYING', refute: 'DORMANT', cool: 'DORMANT', reset: 'BOOTSTRAPPING' },
  VERIFYING: { report: 'REPORTING', refute: 'DORMANT', stale: 'DORMANT', reset: 'BOOTSTRAPPING' },
  REPORTING: { done: 'DORMANT', signal: 'FOCUSED', reset: 'BOOTSTRAPPING' }
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
  const prior = await findPriorState(runtime, input.daemonId);
  if (territoryConflict(prior, input.territoryId)) {
    return { registered: false, errors: ['daemon-territory-conflict'] };
  }
  const occupant = await findTerritoryOccupant(runtime, input);
  if (occupant) {
    return { registered: false, errors: ['daemon-territory-occupied'], occupant };
  }
  const state = restoreRuntimeState(input, prior);
  await persistRegistration(runtime, { daemonId: input.daemonId, state, resumed: Boolean(prior) });
  runtime.daemons.set(input.daemonId, state);
  return { registered: true, daemonId: input.daemonId, ...state, resumed: Boolean(prior) };
}

async function findPriorState(runtime, daemonId) {
  if (!runtime.db) return null;
  return runtime.db.get('SELECT * FROM daemon_runtime_state WHERE daemon_id = ?', daemonId);
}

function territoryConflict(prior, territoryId) {
  return Boolean(prior && prior.territory_id !== territoryId);
}

async function findTerritoryOccupant(runtime, input) {
  if (!runtime.db) return null;
  try {
    const row = await runtime.db.get(
      'SELECT daemon_id FROM daemon_runtime_state WHERE territory_id = ? AND daemon_id != ? LIMIT 1',
      input.territoryId,
      input.daemonId
    );
    return (row && row.daemon_id) || null;
  } catch (_) {
    return null;
  }
}

async function persistRegistration(runtime, registration) {
  if (!runtime.db) return;
  if (registration.resumed) return touchRegistration(runtime.db, registration.daemonId, registration.state);
  return insertRegistration(runtime.db, registration);
}

async function touchRegistration(db, daemonId, state) {
  const res = await db.run(
    `UPDATE daemon_runtime_state
     SET activity = ?, health = ?, last_heartbeat_at = datetime('now'), updated_at = datetime('now')
     WHERE daemon_id = ?`,
    state.activity, state.health, daemonId
  );
  if (!res || res.changes === 0) throw Object.assign(new Error('registration-missing'), { code: 'REGISTRATION_MISSING' });
}

async function insertRegistration(db, registration) {
  await db.run(
    `INSERT INTO daemon_runtime_state
      (daemon_id, territory_id, activity, health, cognitive_revisions, last_heartbeat_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    registration.daemonId,
    registration.state.territoryId,
    registration.state.activity,
    registration.state.health,
    registration.state.revisions
  );
}

function restoreRuntimeState(input, prior) {
  const activity = prior ? 'BOOTSTRAPPING' : input.activity;
  const health = prior ? prior.health : input.health;
  return {
    territoryId: input.territoryId,
    activity: isValidActivity(activity) ? activity : 'BOOTSTRAPPING',
    health: isValidHealth(health) ? health : 'HEALTHY',
    revisions: Number((prior && prior.cognitive_revisions) || 0),
    lastEventId: Number((prior && prior.last_event_id) || 0)
  };
}

async function heartbeat(runtime, tick) {
  if (!runtime || !tick || !tick.daemonId) return { updated: false };
  const entry = runtime.daemons.get(tick.daemonId);
  if (!entry) return { updated: false, errors: ['unknown-daemon'] };
  applyTickToEntry(entry, tick);
  const receipt = await persistHeartbeat(runtime, tick, entry);
  if (runtime.db && !receipt.persisted) return { updated: false, errors: ['persistence-missed'] };
  return { updated: true, activity: entry.activity, health: entry.health, revisions: entry.revisions, lastEventId: entry.lastEventId };
}

function applyTickToEntry(entry, tick) {
  if (tick.activity && tick.activity !== entry.activity) {
    const allowed = Object.values(TRANSITIONS[entry.activity] || {});
    if (isValidActivity(tick.activity) && allowed.includes(tick.activity)) entry.activity = tick.activity;
  }
  if (isValidHealth(tick.health)) entry.health = tick.health;
  if (tick.revision === true) entry.revisions += 1;
}

async function persistHeartbeat(runtime, tick, entry) {
  const nextEventId = Number.isSafeInteger(tick.eventId) ? Math.max(entry.lastEventId || 0, tick.eventId) : (entry.lastEventId || 0);
  if (!runtime.db) { entry.lastEventId = nextEventId; return { persisted: false }; }
  const res = await runtime.db.run(
    `UPDATE daemon_runtime_state
      SET activity = ?, health = ?,
          cognitive_revisions = cognitive_revisions + ?,
          last_event_id = MAX(last_event_id, ?),
          last_heartbeat_at = datetime('now'), updated_at = datetime('now')
     WHERE daemon_id = ?`,
    entry.activity,
    entry.health,
    tick.revision === true ? 1 : 0,
    nextEventId,
    tick.daemonId
  );
  entry.lastEventId = nextEventId;
  return { persisted: Boolean(res && res.changes > 0) };
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
    revisions: row.cognitive_revisions,
    lastEventId: Number(row.last_event_id || 0)
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
