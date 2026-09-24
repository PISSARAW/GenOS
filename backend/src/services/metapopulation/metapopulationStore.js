'use strict';

const { withTransaction } = require('../../db');
const { migrateMetapopulation } = require('../../db/migrations/migrateMetapopulation');
const { migrateMetapopulationRuntime } = require('../../db/migrations/migrateMetapopulationRuntime');
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

async function createPatch(db, metapopulationId, input) {
  await migrateMetapopulation(db);
  const patch = validatePatch(input);
  const now = patch.createdAt || new Date().toISOString();
  await withTransaction(db, async () => {
    await requireSession(db, metapopulationId);
    await db.run(
      `INSERT INTO metapopulation_patches
       (patch_id, metapopulation_id, environment_json, requirements_json, resources_json,
        carrying_capacity, quality, accessibility, status, current_deme_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      patch.patchId, metapopulationId, JSON.stringify(patch.environment), JSON.stringify(patch.requirements),
      JSON.stringify(patch.resources), patch.carryingCapacity, patch.quality, patch.accessibility,
      patch.status, now, now
    );
    await commitEvent(db, metapopulationId, { type: 'PATCH_CREATED', payload: { patchId: patch.patchId } });
  });
  return getPatch(db, metapopulationId, patch.patchId);
}

async function getPatch(db, metapopulationId, patchId) {
  await migrateMetapopulation(db);
  const row = await db.get('SELECT * FROM metapopulation_patches WHERE metapopulation_id = ? AND patch_id = ?', metapopulationId, patchId);
  return row ? toPatch(row) : null;
}

async function listPatches(db, metapopulationId) {
  await migrateMetapopulation(db);
  const rows = await db.all('SELECT * FROM metapopulation_patches WHERE metapopulation_id = ? ORDER BY patch_id', metapopulationId);
  return rows.map(toPatch);
}

async function transitionPatch(db, input) {
  const { metapopulationId, patchId, status } = input;
  await migrateMetapopulation(db);
  await withTransaction(db, async () => {
    await requireSession(db, metapopulationId);
    const result = await db.run(
      'UPDATE metapopulation_patches SET status = ?, updated_at = ? WHERE metapopulation_id = ? AND patch_id = ?',
      status, new Date().toISOString(), metapopulationId, patchId
    );
    if (result.changes !== 1) throw storeError('METAPOPULATION_PATCH_UNKNOWN', 'Unknown patch.');
    await commitEvent(db, metapopulationId, { type: 'PATCH_STATUS_CHANGED', payload: { patchId, status } });
  });
  return getPatch(db, metapopulationId, patchId);
}

async function createDeme(db, metapopulationId, input) {
  await migrateMetapopulation(db);
  const deme = validateDeme(input);
  const now = deme.createdAt || new Date().toISOString();
  await withTransaction(db, async () => {
    await requireSession(db, metapopulationId);
    const patch = await db.get('SELECT status, current_deme_id FROM metapopulation_patches WHERE patch_id = ? AND metapopulation_id = ?', deme.patchId, metapopulationId);
    if (!patch) throw storeError('METAPOPULATION_PATCH_UNKNOWN', 'Deme patch does not exist in this session.');
    if (!['AVAILABLE', 'VACANT'].includes(patch.status) || patch.current_deme_id) throw storeError('METAPOPULATION_PATCH_NOT_COLONIZABLE', 'Patch is not available for a deme.');
    await db.run(
      `INSERT INTO metapopulation_demes
       (deme_id, metapopulation_id, patch_id, status, members_json, local_state_ref, local_memory_ref,
        local_strategies_json, local_procedures_json, lineage_json, fitness_json, diversity,
        last_heartbeat_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deme.demeId, metapopulationId, deme.patchId, deme.status, JSON.stringify(deme.members),
      deme.localStateRef || null, deme.localMemoryRef || null, JSON.stringify(deme.localStrategies),
      JSON.stringify(deme.localProcedures), JSON.stringify(deme.lineage), JSON.stringify(deme.fitness),
      deme.diversity, now, now, now
    );
    await db.run('UPDATE metapopulation_patches SET status = ?, current_deme_id = ?, updated_at = ? WHERE patch_id = ?', 'OCCUPIED', deme.demeId, now, deme.patchId);
    await commitEvent(db, metapopulationId, { type: 'DEME_CREATED', payload: { demeId: deme.demeId, patchId: deme.patchId } });
  });
  return getDeme(db, metapopulationId, deme.demeId);
}

async function getDeme(db, metapopulationId, demeId) {
  await migrateMetapopulation(db);
  const row = await db.get('SELECT * FROM metapopulation_demes WHERE metapopulation_id = ? AND deme_id = ?', metapopulationId, demeId);
  return row ? toDeme(row) : null;
}

async function listDemes(db, metapopulationId) {
  await migrateMetapopulation(db);
  const rows = await db.all('SELECT * FROM metapopulation_demes WHERE metapopulation_id = ? ORDER BY deme_id', metapopulationId);
  return rows.map(toDeme);
}

async function transitionDeme(db, input) {
  const { metapopulationId, demeId, status } = input;
  await migrateMetapopulation(db);
  await withTransaction(db, async () => {
    await requireSession(db, metapopulationId);
    const result = await db.run(
      'UPDATE metapopulation_demes SET status = ?, updated_at = ? WHERE metapopulation_id = ? AND deme_id = ?',
      status, new Date().toISOString(), metapopulationId, demeId
    );
    if (result.changes !== 1) throw storeError('METAPOPULATION_DEME_UNKNOWN', 'Unknown deme.');
    await commitEvent(db, metapopulationId, { type: status === 'AT_RISK' ? 'DEME_AT_RISK' : 'DEME_STATUS_CHANGED', payload: { demeId, status } });
  });
  return getDeme(db, metapopulationId, demeId);
}

async function updateDemeProfile(db, input) {
  await migrateMetapopulation(db);
  const { metapopulationId, demeId } = input;
  const changes = input.changes || {};
  const mutableFields = ['localStrategies', 'localProcedures', 'fitness', 'diversity'];
  if (Object.keys(changes).some((field) => !mutableFields.includes(field))) {
    throw storeError('METAPOPULATION_DEME_PROFILE_FIELD_INVALID', 'Deme profile contains a protected field.');
  }
  await withTransaction(db, async () => {
    await requireSession(db, metapopulationId);
    const currentRow = await db.get('SELECT * FROM metapopulation_demes WHERE metapopulation_id = ? AND deme_id = ?', metapopulationId, demeId);
    if (!currentRow) throw storeError('METAPOPULATION_DEME_UNKNOWN', 'Unknown deme.');
    const updated = validateDeme({ ...toDeme(currentRow), ...changes });
    const now = new Date().toISOString();
    await db.run(
      'UPDATE metapopulation_demes SET local_strategies_json = ?, local_procedures_json = ?, fitness_json = ?, diversity = ?, updated_at = ? WHERE metapopulation_id = ? AND deme_id = ?',
      JSON.stringify(updated.localStrategies), JSON.stringify(updated.localProcedures),
      JSON.stringify(updated.fitness), updated.diversity, now, metapopulationId, demeId
    );
    await commitEvent(db, metapopulationId, { type: 'DEME_PROFILE_UPDATED', payload: { demeId, fields: Object.keys(changes) } });
  });
  return getDeme(db, metapopulationId, demeId);
}

async function attachDemeWorkspace(db, input) {
  await migrateMetapopulationRuntime(db);
  const { metapopulationId, demeId, workspacePath, workspaceOwnerId } = input;
  await withTransaction(db, async () => {
    await requireSession(db, metapopulationId);
    const result = await db.run(
      'UPDATE metapopulation_demes SET workspace_path = ?, workspace_owner_id = ?, local_boundary_json = ?, budget_json = ?, updated_at = ? WHERE metapopulation_id = ? AND deme_id = ? AND workspace_path IS NULL',
      workspacePath, workspaceOwnerId, JSON.stringify(input.localBoundary || []), JSON.stringify(input.budget || {}),
      new Date().toISOString(), metapopulationId, demeId
    );
    if (result.changes !== 1) throw storeError('METAPOPULATION_DEME_WORKSPACE_CONFLICT', 'Deme is missing or already has a workspace.');
    await commitEvent(db, metapopulationId, { type: 'DEME_WORKSPACE_ATTACHED', payload: { demeId, workspaceOwnerId } });
  });
  return getDeme(db, metapopulationId, demeId);
}

async function quarantineDemeForBoundaryViolation(db, input) {
  await migrateMetapopulationRuntime(db);
  const { metapopulationId, demeId, relativePath } = input;
  await withTransaction(db, async () => {
    await requireSession(db, metapopulationId);
    const result = await db.run(
      'UPDATE metapopulation_demes SET status = ?, updated_at = ? WHERE metapopulation_id = ? AND deme_id = ?',
      'QUARANTINED', new Date().toISOString(), metapopulationId, demeId
    );
    if (result.changes !== 1) throw storeError('METAPOPULATION_DEME_UNKNOWN', 'Unknown deme.');
    await commitEvent(db, metapopulationId, { type: 'DEME_BOUNDARY_VIOLATION', payload: { demeId, relativePath } });
  });
}

async function consumeDemeBudget(db, input) {
  await migrateMetapopulationRuntime(db);
  const { metapopulationId, demeId, budgetKey, amount } = input;
  if (!budgetKey || !Number.isFinite(amount) || amount <= 0) throw storeError('METAPOPULATION_BUDGET_INPUT_INVALID', 'A budget key and positive amount are required.');
  return withTransaction(db, async () => {
    const row = await db.get('SELECT budget_json FROM metapopulation_demes WHERE metapopulation_id = ? AND deme_id = ?', metapopulationId, demeId);
    if (!row) throw storeError('METAPOPULATION_DEME_UNKNOWN', 'Unknown deme.');
    const budget = parseJson(row.budget_json);
    const limit = Number(budget.limits?.[budgetKey]);
    const used = Number(budget.used?.[budgetKey] || 0);
    if (!Number.isFinite(limit) || used + amount > limit) throw storeError('METAPOPULATION_DEME_BUDGET_EXHAUSTED', 'Deme budget is exhausted.');
    budget.used = { ...(budget.used || {}), [budgetKey]: used + amount };
    await db.run('UPDATE metapopulation_demes SET budget_json = ?, updated_at = ? WHERE metapopulation_id = ? AND deme_id = ?', JSON.stringify(budget), new Date().toISOString(), metapopulationId, demeId);
    await commitEvent(db, metapopulationId, { type: 'DEME_BUDGET_CONSUMED', payload: { demeId, budgetKey, amount, used: used + amount, limit } });
    return budget;
  });
}

async function requireSession(db, metapopulationId) {
  const found = await db.get('SELECT id FROM metapopulation_sessions WHERE id = ?', metapopulationId);
  if (!found) throw storeError('METAPOPULATION_SESSION_UNKNOWN', 'Unknown metapopulation session.');
}

async function commitEvent(db, metapopulationId, event) {
  const row = await db.get('SELECT revision FROM metapopulation_sessions WHERE id = ?', metapopulationId);
  const revision = Number(row.revision) + 1;
  const now = new Date().toISOString();
  const sequence = await db.get('SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM metapopulation_events WHERE metapopulation_id = ?', metapopulationId);
  const committed = validateRegionalEvent({ ...event, sequence: Number(sequence.value), revision, actor: 'metapopulation-runtime', provenance: { source: 'metapopulationStore' }, occurredAt: now });
  await db.run('UPDATE metapopulation_sessions SET revision = ?, updated_at = ? WHERE id = ?', revision, now, metapopulationId);
  await insertEvent(db, metapopulationId, committed);
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
    lastHeartbeatAt: row.last_heartbeat_at, createdAt: row.created_at, updatedAt: row.updated_at,
    workspacePath: row.workspace_path || null, workspaceOwnerId: row.workspace_owner_id || null,
    localBoundary: parseJson(row.local_boundary_json || '[]'), budget: parseJson(row.budget_json)
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

module.exports = { createSession, loadSession, appendEvent, listEvents, createPatch, getPatch, listPatches, transitionPatch, createDeme, getDeme, listDemes, transitionDeme, updateDemeProfile, attachDemeWorkspace, quarantineDemeForBoundaryViolation, consumeDemeBudget };
