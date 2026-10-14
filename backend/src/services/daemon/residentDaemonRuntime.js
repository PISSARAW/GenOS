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

const { withTransaction } = require('../../db');
const { migrateDaemonTerritory } = require('../../db/migrations/migrateDaemonTerritory');
const { buildIdentityDossier } = require('../agentIdentityDossierService');
const identity = require('../identity/daemon');

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
    identityOwner: require('crypto').randomUUID(),
    genomeRef: (options && options.genomeRef) || GENOME_REF,
    daemons: new Map(),
    pending: new Map(),
    started: false
  };
}

async function ensureRuntimeTables(runtime) {
  if (!runtime.db) return;
  await migrateDaemonTerritory(runtime.db);
  await require('../../db/migrations/migrateAgentIdentity').migrateAgentIdentity(runtime.db);
}

function registerDaemon(runtime, input) {
  if (!runtime || !input) return Promise.resolve({ registered: false });
  const pending = runtime.pending.get('__registration__') || Promise.resolve();
  const register = () => registerDaemonUnlocked(runtime, input);
  const work = pending.catch(() => {}).then(() => runtime.db ? withTransaction(runtime.db, register) : register());
  runtime.pending.set('__registration__', work);
  return work;
}

async function registerDaemonUnlocked(runtime, input) {
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
  state.identitySession = await identity.register(runtime, input.daemonId, runtime.daemons.get(input.daemonId)?.identitySession);
  runtime.daemons.set(input.daemonId, state);
  return withDaemonIdentity(runtime, input.daemonId, { ...state, resumed: Boolean(prior) });
}

async function withDaemonIdentity(runtime, daemonId, state) {
  const continuity = await identity.describe(runtime, daemonId);
  const { identitySession, ...publicState } = state;
  const identityDossier = buildIdentityDossier({ agentId: daemonId, kind: 'daemon',
    daemon: { daemonId, ...state, genomeRef: runtime.genomeRef }, continuity });
  if (!identitySession || !continuity.active || continuity.incarnationId !== identitySession.incarnationId) {
    identityDossier.decisionConstraints = { ...identityDossier.decisionConstraints,
      mayAct: false, reason: 'INACTIVE_INCARNATION' };
  }
  return { registered: true, daemonId, ...publicState, identityDossier,
    identityDecision: identityDossier.decisionConstraints };
}

async function findPriorState(runtime, daemonId) {
  if (!runtime.db) {
    const state = runtime.daemons.get(daemonId);
    return state ? { territory_id: state.territoryId, health: state.health, cognitive_revisions: state.revisions, last_event_id: state.lastEventId } : null;
  }
  return runtime.db.get('SELECT * FROM daemon_runtime_state WHERE daemon_id = ?', daemonId);
}

function territoryConflict(prior, territoryId) {
  return Boolean(prior && prior.territory_id !== territoryId);
}

async function findTerritoryOccupant(runtime, input) {
  if (!runtime.db) {
    for (const [id, state] of runtime.daemons) {
      if (id !== input.daemonId && state.territoryId === input.territoryId) return id;
    }
    return null;
  }
  {
    const row = await runtime.db.get(
      'SELECT daemon_id FROM daemon_runtime_state WHERE territory_id = ? AND daemon_id != ? LIMIT 1',
      input.territoryId,
      input.daemonId
    );
    return (row && row.daemon_id) || null;
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
      (daemon_id, territory_id, activity, health, cognitive_revisions, created_at, last_heartbeat_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    registration.daemonId,
    registration.state.territoryId,
    registration.state.activity,
    registration.state.health,
    registration.state.revisions,
    registration.state.createdAt
  );
}

function restoreRuntimeState(input, prior) {
  const activity = prior ? 'BOOTSTRAPPING' : input.activity;
  const health = prior ? prior.health : input.health;
  return {
    territoryId: input.territoryId,
    activity: isValidActivity(activity) ? activity : 'BOOTSTRAPPING',
    health: isValidHealth(health) ? health : 'HEALTHY',
    createdAt: prior?.created_at || new Date().toISOString(),
    revisions: Number((prior && prior.cognitive_revisions) || 0),
    lastEventId: Number((prior && prior.last_event_id) || 0)
  };
}

function heartbeat(runtime, tick) {
  if (!runtime || !tick || !tick.daemonId) return Promise.resolve({ updated: false });
  const pending = runtime.pending.get(tick.daemonId) || Promise.resolve();
  const work = pending.catch(() => {}).then(() => heartbeatUnlocked(runtime, tick));
  runtime.pending.set(tick.daemonId, work);
  return work;
}

async function heartbeatUnlocked(runtime, tick) {
  if (!runtime || !tick || !tick.daemonId) return { updated: false };
  const prior = runtime.daemons.get(tick.daemonId);
  if (!prior) return { updated: false, errors: ['unknown-daemon'] };
  const entry = { ...prior };
  await identity.check(runtime, entry);
  applyTickToEntry(entry, tick);
  const receipt = await persistHeartbeat(runtime, tick, entry);
  if (runtime.db && !receipt.persisted) return { updated: false, errors: ['persistence-missed'] };
  runtime.daemons.set(tick.daemonId, entry);
  return { updated: true, ...await withDaemonIdentity(runtime, tick.daemonId, entry) };
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
  if (entry) return { found: true, source: 'memory',
    ...await withDaemonIdentity(runtime, query.daemonId, entry) };
  if (!runtime.db) return { found: false };
  const row = await runtime.db.get('SELECT * FROM daemon_runtime_state WHERE daemon_id = ?', query.daemonId);
  if (!row) return { found: false };
  return { ...await withDaemonIdentity(runtime, row.daemon_id, {
    territoryId: row.territory_id, activity: row.activity, health: row.health,
    revisions: row.cognitive_revisions, createdAt: row.created_at,
    updatedAt: row.updated_at, lastEventId: Number(row.last_event_id || 0)
  }),
    found: true,
    source: 'sqlite',
  };
}

async function listDaemonStates(runtime) {
  if (!runtime) return [];
  if (!runtime.db) return [...runtime.daemons].map(([daemonId, state]) => ({ daemonId, ...state }));
  await ensureRuntimeTables(runtime);
  const rows = await runtime.db.all('SELECT daemon_id FROM daemon_runtime_state ORDER BY daemon_id');
  const states = [];
  for (const row of rows) states.push(await getDaemonState(runtime, { daemonId: row.daemon_id }));
  return states;
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
  getDaemonState,
  listDaemonStates,
  releaseDaemon: identity.release
};
