'use strict';

const { withTransaction } = require('../../db');
const { migrateMetapopulation } = require('../../db/migrations/migrateMetapopulation');
const { validateRegionalEvent } = require('./contracts/regionalEventContract');
const { validatePatch } = require('./contracts/patchContract');
const { validateDeme } = require('./contracts/demeContract');

async function createSession(db, session, event) {
  await migrateMetapopulation(db);
  return withTransaction(db, async () => {
    await db.run(
      `INSERT INTO metapopulation_sessions
       (id, mission_id, mission, organization, scope, status, generation, revision, migration_graph_json, regional_memory_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      session.metapopulationId, session.missionId, session.mission, session.organization, session.scope, session.status,
      session.generation, JSON.stringify(session.migrationGraph), JSON.stringify(session.regionalMemory),
      session.createdAt, session.updatedAt
    );
    await insertEvent(db, session.metapopulationId, { ...event, sequence: 1, revision: 1 });
    return { metapopulationId: session.metapopulationId, revision: 1 };
  });
}

async function loadSession(db, metapopulationId) {
  await migrateMetapopulation(db);
  const row = await db.get('SELECT * FROM metapopulation_sessions WHERE id = ?', metapopulationId);
  if (!row) return null;
  const [patchRows, demeRows, corridorRows] = await Promise.all([
    db.all('SELECT * FROM metapopulation_patches WHERE metapopulation_id = ? ORDER BY patch_id', metapopulationId),
    db.all('SELECT * FROM metapopulation_demes WHERE metapopulation_id = ? ORDER BY deme_id', metapopulationId),
    db.all('SELECT * FROM metapopulation_corridors WHERE metapopulation_id = ? ORDER BY corridor_id', metapopulationId)
  ]);
  return {
    metapopulationId: row.id,
    sessionId: row.id,
    missionId: row.mission_id,
    mission: row.mission,
    organization: row.organization,
    scope: row.scope,
    status: row.status,
    generation: row.generation,
    revision: row.revision,
    patches: patchRows.map(toPatch),
    demes: demeRows.map(toDeme),
    migrationGraph: { ...parseJson(row.migration_graph_json), corridors: corridorRows.map(toCorridor) },
    regionalMemory: parseJson(row.regional_memory_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function appendEvent(db, metapopulationId, event) {
  await migrateMetapopulation(db);
  return withTransaction(db, async () => {
    const session = await db.get('SELECT revision FROM metapopulation_sessions WHERE id = ?', metapopulationId);
    if (!session) throw storeError('METAPOPULATION_SESSION_UNKNOWN', 'Unknown metapopulation session.');
    const revision = Number(session.revision) + 1;
    const sequenceRow = await db.get(
      'SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM metapopulation_events WHERE metapopulation_id = ?',
      metapopulationId
    );
    const sequence = Number(sequenceRow.sequence);
    const now = event.occurredAt || new Date().toISOString();
    const committedEvent = validateRegionalEvent({ ...event, sequence, revision, occurredAt: now });
    const result = await db.run(
      'UPDATE metapopulation_sessions SET revision = ?, updated_at = ? WHERE id = ? AND revision = ?',
      revision, now, metapopulationId, session.revision
    );
    if (result.changes !== 1) throw storeError('METAPOPULATION_SESSION_CONFLICT', 'Metapopulation session revision changed.');
    await insertEvent(db, metapopulationId, committedEvent);
    return committedEvent;
  });
}

async function listEvents(db, metapopulationId) {
  await migrateMetapopulation(db);
  const rows = await db.all(
    'SELECT sequence, revision, event_type, payload_json, provenance_json, actor, occurred_at FROM metapopulation_events WHERE metapopulation_id = ? ORDER BY sequence',
    metapopulationId
  );
  return rows.map((row) => ({
    sequence: row.sequence,
    revision: row.revision,
    type: row.event_type,
    payload: parseJson(row.payload_json),
    provenance: parseJson(row.provenance_json),
    actor: row.actor,
    occurredAt: row.occurred_at
  }));
}

async function insertEvent(db, metapopulationId, event) {
  const valid = validateRegionalEvent(event);
  await db.run(
    `INSERT INTO metapopulation_events
     (metapopulation_id, sequence, revision, event_type, payload_json, provenance_json, actor, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    metapopulationId, valid.sequence, valid.revision, valid.type, JSON.stringify(valid.payload || {}),
    JSON.stringify(valid.provenance || {}), valid.actor, valid.occurredAt
  );
}

function toPatch(row) {
  return {
    patchId: row.patch_id, environment: parseJson(row.environment_json),
    requirements: parseJson(row.requirements_json), resources: parseJson(row.resources_json),
    carryingCapacity: row.carrying_capacity, quality: row.quality, accessibility: row.accessibility,
    status: row.status, currentDemeId: row.current_deme_id, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function toDeme(row) {
  return {
    demeId: row.deme_id, patchId: row.patch_id, status: row.status, members: parseJson(row.members_json),
    localStateRef: row.local_state_ref, localMemoryRef: row.local_memory_ref,
    localStrategies: parseJson(row.local_strategies_json), localProcedures: parseJson(row.local_procedures_json),
    lineage: parseJson(row.lineage_json), fitness: parseJson(row.fitness_json), diversity: row.diversity,
    lastHeartbeatAt: row.last_heartbeat_at, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function toCorridor(row) {
  return {
    corridorId: row.corridor_id, sourceDemeId: row.source_deme_id, targetDemeId: row.target_deme_id,
    direction: 'directed', enabled: Boolean(row.enabled), capacity: row.capacity,
    migrationCost: row.migration_cost, compatibility: row.compatibility,
    acceptedMigrations: row.accepted_migrations, rejectedMigrations: row.rejected_migrations,
    benefitHistory: parseJson(row.benefit_history_json), homogenizationRisk: row.homogenization_risk,
    weight: row.weight, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

function storeError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { createSession, loadSession, appendEvent, listEvents };
