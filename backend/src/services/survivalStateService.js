'use strict';

const { evaluateSurvival } = require('./survivalModelService');
const resilience = require('./resilienceService');
const wakeService = require('./survivalWakeService');
const crypto = require('crypto');
const { withTransaction } = require('../db');

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

const RECOVERY_ACTIONS = Object.freeze({
  starvation: ['reduce_fanout', 'prefer_low_cost_tools'],
  infection: ['quarantine', 'require_independent_evidence'],
  injury: ['isolate_restore_validate'],
  predation: ['quarantine', 'request_human_review'],
  overgrowth: ['prune_workers'],
  isolation: ['request_helper'],
  conflict: ['require_independent_evidence'],
  senescence: ['prune_memory'],
  habitat_loss: ['migrate_workspace', 'enter_dormancy'],
  stagnation: ['controlled_mutation']
});

function recoveryPlan(pressures) {
  return pressures.flatMap((pressure) => (RECOVERY_ACTIONS[pressure] || []).map((action) => ({
    pressure, action, status: 'requested', requiresReceipt: true
  })));
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
  return { ...(await get(db, id)), changed: previous?.state !== state, eventType, recoveryPlan: recoveryPlan(survival.pressures) };
}

async function transition(db, command = {}) {
  const current = await get(db, command.agentId);
  assertTransition(current?.state, command.toState);
  return observe(db, command.agentId, { ...(command.payload || {}), forcedState: command.toState });
}

async function suspend(db, command = {}) {
  const id = ensureAgentId(command.agentId);
  if (command.missionId && !normalizeIndependentMission(command.mission)) {
    throw Object.assign(new Error('A resumable mission objective is required for dormancy.'), { code: 'SURVIVAL_MISSION_REQUIRED' });
  }
  return withTransaction(db, async () => {
    await assertMissionOrchestrator(db, command.missionId, id);
    const snapshot = await freezeMissionSnapshot({ db, command, agentId: id });
    const wake = await armPersistedWake({ db, command, agentId: id, snapshot });
    const state = await observeDormancy({ db, agentId: id, snapshot, wake });
    if (command.missionId) await require('./missionIdentityService').setStatus(db, command.missionId, 'dormant');
    return { success: true, state, snapshot, wakeCondition: wake };
  });
}

async function assertMissionOrchestrator(db, missionId, agentId) {
  if (!missionId) return;
  const mission = await require('./missionIdentityService').get(db, missionId);
  if (!mission || mission.orchestratorAgentId !== agentId) {
    throw Object.assign(new Error('Only the mission current orchestrator can suspend it.'), { code: 'MISSION_ORCHESTRATOR_MISMATCH' });
  }
}

async function freezeMissionSnapshot(input) {
  const { db, command, agentId } = input;
  const payload = {
    agentId, workspaceId: command.workspaceId || null, survivalState: await get(db, agentId),
    ...(command.statePayload || {}), missionId: command.missionId || null,
    mission: normalizeIndependentMission(command.mission)
  };
  return resilience.freezeCryptobiosis(db, command.workspaceId || null, command.reason || 'survival dormancy', payload);
}

async function armPersistedWake(input) {
  const { db, command, agentId, snapshot } = input;
  const persisted = await db.get("SELECT snapshot_id FROM cryptobiosis_snapshots WHERE snapshot_id = ? AND status = 'frozen'", snapshot.snapshotId);
  if (!persisted) throw Object.assign(new Error('A persisted frozen snapshot is required before arming wake.'), { code: 'SURVIVAL_SNAPSHOT_REQUIRED' });
  return wakeService.arm({
    db, agentId, condition: command.wakeCondition || { type: 'operator_or_signal' },
    snapshotId: persisted.snapshot_id, missionId: command.missionId,
    organizationId: command.organizationId, projectId: command.projectId
  });
}

function observeDormancy(input) {
  const { db, agentId, snapshot, wake } = input;
  return observe(db, agentId, {
    energy: 0, forcedState: 'dormant', snapshotId: snapshot.snapshotId, wakeConditionId: wake.id
  });
}

function normalizeIndependentMission(mission) {
  if (!mission || typeof mission !== 'object' || Array.isArray(mission)) return null;
  const prompt = mission.prompt || mission.objective || mission.task;
  if (typeof prompt !== 'string' || !prompt.trim()) return null;
  return { ...mission, prompt: prompt.trim() };
}

const RECEIPT_TYPES = Object.freeze({
  isolate_restore_validate: 'repair', migrate_workspace: 'migration', prune_memory: 'pruning',
  reproduce_strategy: 'reproduction', controlled_mutation: 'mutation', prune_workers: 'pruning'
});

async function recordActionReceipt(db, receipt = {}) {
  const type = RECEIPT_TYPES[receipt.action];
  if (!type || receipt.type !== type || !receipt.agentId || !receipt.executionId || !receipt.evidenceRef || receipt.outcome !== 'succeeded') {
    throw Object.assign(new Error('A typed successful execution receipt with evidenceRef is required.'), { code: 'SURVIVAL_RECEIPT_INVALID' });
  }
  await ensureStorage(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS survival_action_receipts (
    receipt_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, receipt_type TEXT NOT NULL,
    action TEXT NOT NULL, execution_id TEXT NOT NULL, evidence_ref TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome = 'succeeded'), payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
  const receiptId = receipt.receiptId || `survival_receipt_${crypto.randomUUID()}`;
  const payload = { ...receipt, receiptId, type };
  await db.run(`INSERT INTO survival_action_receipts
    (receipt_id, agent_id, receipt_type, action, execution_id, evidence_ref, outcome, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?)`, receiptId, receipt.agentId, type, receipt.action, receipt.executionId, receipt.evidenceRef, JSON.stringify(payload));
  const telemetry = await observe(db, receipt.agentId, { ...(receipt.postActionTelemetry || {}), source: 'survival_action_receipt', receiptId });
  return { receipt: payload, telemetry };
}

async function resolveWakeContext(db, command, id) {
  const armed = command.wakeConditionId ? await wakeService.get({ db, id: command.wakeConditionId }) : (await wakeService.listArmed({ db, agentId: id }))[0];
  if (!armed || armed.status !== 'armed') return { success: false, code: 'WAKE_CONDITION_NOT_ARMED' };
  if (armed.agentId !== id) return { success: false, code: 'SURVIVAL_WAKE_AGENT_MISMATCH' };
  const current = await get(db, id);
  if (!current || current.state !== 'dormant') return { success: false, code: 'SURVIVAL_NOT_DORMANT', state: current };
  if (!current.snapshotId) return { success: false, code: 'SURVIVAL_SNAPSHOT_REQUIRED' };
  if (armed.snapshotId !== current.snapshotId) return { success: false, code: 'SURVIVAL_WAKE_SNAPSHOT_MISMATCH' };
  const persistedSnapshot = await db.get("SELECT snapshot_id FROM cryptobiosis_snapshots WHERE snapshot_id = ? AND status = 'frozen'", current.snapshotId);
  if (!persistedSnapshot) return { success: false, code: 'SURVIVAL_SNAPSHOT_NOT_FOUND' };
  return { success: true, armed, current };
}

async function wake(db, command = {}) {
  const id = ensureAgentId(command.agentId);
  const context = await resolveWakeContext(db, command, id);
  if (!context.success) return context;
  if (!await wakeConditionSatisfied(db, context.armed, command.event)) return { success: false, code: 'SURVIVAL_WAKE_EVENT_MISMATCH' };
  const claim = await wakeService.trigger({ db, id: context.armed.id });
  if (!claim.claimed) return { success: false, code: 'SURVIVAL_WAKE_ALREADY_CLAIMED' };
  return completeWake({ db, command, agentId: id, context });
}

async function completeWake(input) {
  const { db, command, agentId, context } = input;
  const { armed, current } = context;
  const restored = await resilience.thawCryptobiosis(db, current.snapshotId, command.workspaceId);
  if (!restored.success) {
    await wakeService.rearm({ db, id: armed.id });
    return restored;
  }
  await observe(db, agentId, { forcedState: 'waking', snapshotId: current.snapshotId, wakeConditionId: armed.id });
  const resumed = await resumeMission(db, { command, mission: normalizeIndependentMission(restored.state?.mission), restored, agentId });
  if (!resumed.success) return preserveDormancy({ db, agentId, current, armed, resumed });
  return finishWake({ db, command, agentId, current, armed, restored, resumed });
}

async function wakeConditionSatisfied(db, armed, event) {
  if (armed.condition.type === 'operator_or_signal') return event?.type === 'operator_signal' && event.authorized === true;
  if (armed.condition.type === 'time_elapsed') return hasElapsed(armed.condition);
  if (!event || ![event.type, event.kind].includes(armed.condition.type)) return false;
  return require('./missionResourceRegistryService').satisfies(db, armed);
}

async function preserveDormancy(input) {
  const { db, agentId, current, armed, resumed } = input;
  await observe(db, agentId, { forcedState: 'dormant', snapshotId: current.snapshotId, wakeConditionId: armed.id });
  await wakeService.rearm({ db, id: armed.id });
  await db.run("UPDATE cryptobiosis_snapshots SET status = 'frozen', thawed_at = NULL WHERE snapshot_id = ?", current.snapshotId);
  return resumed;
}

async function finishWake(input) {
  const { db, command, agentId, current, armed, restored, resumed } = input;
  await db.run("UPDATE cryptobiosis_snapshots SET status = 'thawed', thawed_at = CURRENT_TIMESTAMP WHERE snapshot_id = ? AND status = 'frozen'", current.snapshotId);
  const state = await observe(db, agentId, {
    energy: command.energy ?? 1, forcedState: 'recovered', snapshotId: current.snapshotId, wakeConditionId: armed.id
  });
  return { success: true, restored, state, resumed };
}

async function resumeMission(db, input = {}) {
  const { command, mission, restored, agentId } = input;
  if (!mission) return restored.state?.missionId
    ? { success: false, code: 'SURVIVAL_MISSION_REQUIRED' }
    : { success: true, resumed: null };
  const successorId = command.orchestratorAgentId || agentId;
  try {
    const resumed = await require('./missionSuccessionService').resumeWithAuthority(db, {
      mission, successorId,
      expectedOrchestratorId: command.expectedOrchestratorId,
      workspaceId: command.workspaceId || restored.workspaceId
    });
    return { success: true, resumed };
  } catch (error) {
    return { success: false, code: error.code || 'SURVIVAL_RESUME_FAILED', error: error.message };
  }
}

function hasElapsed(expected) {
  const dueAt = Date.parse(expected.dueAt || expected.at || '');
  return Number.isFinite(dueAt) && Date.now() >= dueAt;
}

module.exports = { STATES, get, observe, transition, suspend, wake, recoveryPlan, recordActionReceipt, RECEIPT_TYPES, ensureStorage };
