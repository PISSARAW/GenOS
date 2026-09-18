'use strict';

const { evaluateSurvival } = require('./survivalModelService');

const STATES = Object.freeze(['nominal', 'stressed', 'protected', 'dormant', 'waking', 'recovered', 'quarantined']);
const PRESSURE_STATES = new Set(['starvation', 'infection', 'injury', 'predation', 'overgrowth', 'isolation', 'conflict', 'senescence', 'habitat_loss', 'stagnation']);
const TRANSITIONS = Object.freeze({
  nominal: new Set(['nominal', 'stressed', 'protected', 'dormant']),
  stressed: new Set(['nominal', 'stressed', 'protected', 'dormant']),
  protected: new Set(['nominal', 'stressed', 'protected', 'dormant', 'quarantined']),
  dormant: new Set(['dormant', 'waking']),
  waking: new Set(['waking', 'recovered', 'protected', 'dormant']),
  recovered: new Set(['recovered', 'nominal', 'stressed', 'protected']),
  quarantined: new Set(['quarantined', 'protected', 'recovered', 'dormant'])
});

function parseJson(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function nextState(survival) {
  if (survival.constraints.suspend) return 'dormant';
  if (survival.actions.includes('quarantine')) return 'quarantined';
  if (survival.pressures.length) return survival.state?.energy < 0.25 ? 'protected' : 'stressed';
  return 'nominal';
}

function ensureAgentId(agentId) {
  if (!agentId) throw new Error('agentId is required for survival state observation.');
  return String(agentId);
}

function assertTransition(fromState, toState) {
  if (!STATES.includes(toState)) throw new Error(`Unknown survival state '${toState}'.`);
  if (fromState && !TRANSITIONS[fromState]?.has(toState)) {
    throw Object.assign(new Error(`Invalid survival transition ${fromState} -> ${toState}.`), { code: 'SURVIVAL_INVALID_TRANSITION' });
  }
}

async function ensureStorage(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS survival_states (
    agent_id TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'nominal', state_json TEXT NOT NULL DEFAULT '{}',
    pressures_json TEXT NOT NULL DEFAULT '[]', actions_json TEXT NOT NULL DEFAULT '[]', snapshot_id TEXT,
    wake_condition_id TEXT, version INTEGER NOT NULL DEFAULT 1, observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (state IN ('nominal', 'stressed', 'protected', 'dormant', 'waking', 'recovered', 'quarantined')),
    CHECK (json_valid(state_json)), CHECK (json_valid(pressures_json)), CHECK (json_valid(actions_json))
  );
  CREATE TABLE IF NOT EXISTS survival_state_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, from_state TEXT, to_state TEXT NOT NULL,
    event_type TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(payload_json))
  );`);
}

function format(row) {
  if (!row) return null;
  return { agentId: row.agent_id, state: row.state, stateData: parseJson(row.state_json, {}), pressures: parseJson(row.pressures_json, []), actions: parseJson(row.actions_json, []), snapshotId: row.snapshot_id, wakeConditionId: row.wake_condition_id, version: row.version, observedAt: row.observed_at };
}

async function get(db, agentId) {
  await ensureStorage(db);
  return format(await db.get('SELECT * FROM survival_states WHERE agent_id = ?', ensureAgentId(agentId)));
}

async function observe(db, agentId, input = {}) {
  const id = ensureAgentId(agentId);
  await ensureStorage(db);
  const previous = await get(db, id);
  const survival = evaluateSurvival(input);
  const state = input.forcedState || nextState(survival);
  assertTransition(previous?.state, state);
  const version = (previous?.version || 0) + 1;
  const eventType = previous?.state === state ? 'SURVIVAL_STATE_OBSERVED' : `SURVIVAL_${state.toUpperCase()}_ENTERED`;
  await db.run(`INSERT OR REPLACE INTO survival_states
    (agent_id, state, state_json, pressures_json, actions_json, snapshot_id, wake_condition_id, version, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    id, state, JSON.stringify(survival.state), JSON.stringify(survival.pressures), JSON.stringify(survival.actions),
    input.snapshotId || previous?.snapshotId || null, input.wakeConditionId || previous?.wakeConditionId || null, version);
  await db.run(`INSERT INTO survival_state_events (agent_id, from_state, to_state, event_type, payload_json)
    VALUES (?, ?, ?, ?, ?)`, id, previous?.state || null, state, eventType, JSON.stringify({ survival, input }));
  return { ...(await get(db, id)), changed: previous?.state !== state, eventType };
}

async function transition(db, command = {}) {
  const current = await get(db, command.agentId);
  assertTransition(current?.state, command.toState);
  return observe(db, command.agentId, { ...(command.payload || {}), forcedState: command.toState });
}

module.exports = { STATES, get, observe, transition, ensureStorage };
