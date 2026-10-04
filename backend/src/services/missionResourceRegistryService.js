'use strict';

const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../db');

const KINDS = new Set(['budget', 'provider', 'external']);

async function ensureStorage(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS mission_resource_observations (
    id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, kind TEXT NOT NULL, resource_key TEXT NOT NULL,
    value_json TEXT NOT NULL, actor TEXT NOT NULL, evidence_ref TEXT NOT NULL,
    observed_at TEXT NOT NULL, expires_at TEXT,
    CHECK (kind IN ('budget','provider','external')), CHECK (json_valid(value_json))
  );
  CREATE INDEX IF NOT EXISTS idx_mission_resource_latest
    ON mission_resource_observations(mission_id, kind, resource_key, observed_at DESC);`);
}

function invalid(message) {
  return Object.assign(new Error(message), { code: 'MISSION_RESOURCE_INVALID', status: 400 });
}

function validate(input) {
  if (!input || !KINDS.has(input.kind) || !filled(input.missionId)
    || !filled(input.actor) || !filled(input.evidenceRef)) {
    throw invalid('Mission, resource kind, actor and evidence reference are required.');
  }
  if (input.id !== undefined && !filled(input.id)) throw invalid('Observation ID must be a nonempty string.');
  const validators = { budget: validateBudget, provider: validateProvider, external: validateExternal };
  validators[input.kind](input);
}

function filled(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function validateBudget(input) {
  if (!Number.isSafeInteger(input.availableTokens) || input.availableTokens < 0) {
    throw invalid('Budget must be an absolute nonnegative integer token balance.');
  }
}

function validateProvider(input) {
  if (!filled(input.resourceKey) || typeof input.available !== 'boolean') {
    throw invalid('Provider ID and availability are required.');
  }
  if (input.available && !validExpiry(input.expiresAt)) {
    throw invalid('An available provider requires a future expiry within one hour.');
  }
}

function validateExternal(input) {
  if (!filled(input.resourceKey)) throw invalid('External event name is required.');
  if (!validExpiry(input.expiresAt)) {
    throw invalid('An external event requires a future expiry within one hour.');
  }
}

function validExpiry(value) {
  const delta = Date.parse(value) - Date.now();
  return Number.isFinite(delta) && delta > 0 && delta <= 3600000;
}

async function record(db, input) {
  validate(input);
  await ensureStorage(db);
  const observation = buildObservation(input);
  return withTransaction(db, async () => {
    const existing = await db.get('SELECT * FROM mission_resource_observations WHERE id = ?', observation.id);
    if (existing) return unchanged(existing, observation);
    await assertMissionActive(db, input.missionId);
    await insertObservation(db, observation);
    return observation;
  });
}

function buildObservation(input) {
  const key = input.kind === 'budget' ? 'tokens' : input.resourceKey.trim();
  const value = input.kind === 'budget' ? { availableTokens: input.availableTokens }
    : input.kind === 'provider' ? { available: input.available } : { occurred: true };
  return {
    id: input.id || `resource_${randomUUID()}`, missionId: input.missionId, kind: input.kind, resourceKey: key, value,
    actor: input.actor, evidenceRef: input.evidenceRef,
    observedAt: new Date().toISOString(),
    expiresAt: input.kind === 'budget' || (input.kind === 'provider' && !input.available)
      ? null : input.expiresAt
  };
}

async function assertMissionActive(db, missionId) {
  const mission = await require('./missionIdentityService').get(db, missionId);
  if (!mission || !['active', 'dormant'].includes(mission.status)) {
    throw Object.assign(new Error('An active or dormant mission is required.'), { code: 'MISSION_NOT_ACTIVE', status: 409 });
  }
}

function unchanged(existing, observation) {
  const previous = format(existing);
  const fields = ['missionId', 'kind', 'resourceKey', 'actor', 'evidenceRef', 'expiresAt'];
  if (fields.some(field => previous[field] !== observation[field])
    || existing.value_json !== JSON.stringify(observation.value)) {
    throw Object.assign(new Error('Resource observation ID conflicts with a different value.'), { code: 'MISSION_RESOURCE_CONFLICT', status: 409 });
  }
  return previous;
}

async function insertObservation(db, observation) {
  await db.run(`INSERT INTO mission_resource_observations
    (id, mission_id, kind, resource_key, value_json, actor, evidence_ref, observed_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, observation.id, observation.missionId, observation.kind,
  observation.resourceKey, JSON.stringify(observation.value), observation.actor,
  observation.evidenceRef, observation.observedAt, observation.expiresAt);
}

function format(row) {
  return { id: row.id, missionId: row.mission_id, kind: row.kind, resourceKey: row.resource_key,
    value: JSON.parse(row.value_json), actor: row.actor, evidenceRef: row.evidence_ref,
    observedAt: row.observed_at, expiresAt: row.expires_at };
}

async function latest(db, query) {
  await ensureStorage(db);
  const row = await db.get(`SELECT * FROM mission_resource_observations
    WHERE mission_id = ? AND kind = ? AND resource_key = ?
    ORDER BY observed_at DESC, rowid DESC LIMIT 1`, query.missionId, query.kind, query.resourceKey);
  return row ? format(row) : null;
}

async function satisfies(db, armed) {
  if (!armed.missionId) return false;
  const evaluators = {
    budget_added: budgetSatisfied, budget_restored: budgetSatisfied,
    provider_available: providerSatisfied, external_event: externalSatisfied,
    human_resolves_gate: humanGateSatisfied
  };
  return evaluators[armed.condition.type] ? evaluators[armed.condition.type](db, armed) : false;
}

async function budgetSatisfied(db, armed) {
  const row = await latest(db, { missionId: armed.missionId, kind: 'budget', resourceKey: 'tokens' });
  return Boolean(row && row.value.availableTokens >= Number(armed.condition.minimumTokens || 1));
}

async function providerSatisfied(db, armed) {
  if (!armed.condition.providerId) return false;
  const row = await latest(db, { missionId: armed.missionId, kind: 'provider', resourceKey: armed.condition.providerId });
  return Boolean(row?.value.available && Date.parse(row.expiresAt) > Date.now());
}

async function externalSatisfied(db, armed) {
  if (!armed.condition.eventName) return false;
  const row = await latest(db, { missionId: armed.missionId, kind: 'external', resourceKey: armed.condition.eventName });
  return Boolean(row && Date.parse(row.expiresAt) > Date.now()
    && Date.parse(row.observedAt) >= Date.parse(`${armed.createdAt.replace(' ', 'T')}Z`));
}

async function humanGateSatisfied(db, armed) {
  if (!armed.condition.gateId) return false;
  const row = await db.get(`SELECT id FROM platform_approvals
    WHERE id = ? AND agent_id = ? AND status = 'approved'
      AND decision_by IS NOT NULL AND decided_at IS NOT NULL`, armed.condition.gateId, armed.agentId);
  return Boolean(row);
}

module.exports = { record, latest, satisfies, ensureStorage };
