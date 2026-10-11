'use strict';

const path = require('node:path');
const { VARIANTS } = require('../metapopulation/policy/metapopulationPolicyService');
const { digest, refusal } = require('../topologySnapshotContract');

const QUIET = new Set(['QUIESCENT', 'CLOSED']);
const GROUPS = Object.freeze({
  events: ['metapopulation_events', 'event_id'],
  patches: ['metapopulation_patches', 'patch_id'],
  demes: ['metapopulation_demes', 'deme_id'],
  corridors: ['metapopulation_corridors', 'corridor_id'],
  migrations: ['metapopulation_migrations', 'migration_id'],
  colonizations: ['metapopulation_colonizations', 'colonization_id'],
  extinctions: ['metapopulation_extinctions', 'extinction_id'],
  heartbeats: ['metapopulation_deme_heartbeats', 'heartbeat_id'],
  cycles: ['metapopulation_cycle_states', 'state_id'],
  ephemeralLeases: ['ephemeral_leases', 'lease_id'],
  daemonLeases: ['daemon_leases', 'lease_id'],
  daemonMemory: ['daemon_memory', 'memory_id'],
  fitness: ['mission_fitness', 'fitness_id'],
  cultures: ['metapopulation_cultures', 'culture_id'],
  transmissions: ['culture_transmissions', 'transmission_id'],
  phylogeny: ['culture_phylogeny', 'node_id']
});
const VARIANT_EVIDENCE = Object.freeze({
  balanced: ['demes', 'corridors', 'migrations'],
  resilient: ['heartbeats', 'extinctions', 'colonizations'],
  exploratory: ['cycles', 'migrations', 'fitness'],
  conservative: ['migrations', 'cycles'],
  classic_patch: ['patches', 'colonizations', 'extinctions'],
  island_search: ['cycles', 'fitness', 'migrations'],
  heterogeneous_islands: ['demes', 'cultures', 'transmissions'],
  source_sink: ['corridors', 'migrations', 'heartbeats'],
  rescue_network: ['heartbeats', 'colonizations', 'extinctions'],
  stepping_stone: ['corridors', 'migrations', 'transmissions'],
  anti_synchrony: ['corridors', 'cycles', 'extinctions'],
  federated: ['migrations', 'cultures', 'transmissions'],
  ephemeral_patch: ['ephemeralLeases', 'patches', 'colonizations'],
  persistent: ['daemonLeases', 'daemonMemory', 'fitness'],
  evolutionary: ['fitness', 'cycles', 'demes'],
  cultural: ['cultures', 'transmissions', 'phylogeny']
});

function fail(code, message) { throw refusal(code, message); }

function parseObject(raw, label) {
  let value;
  try { value = JSON.parse(raw); } catch (_) { fail('METAPOPULATION_SNAPSHOT_CORRUPT', `${label} is invalid JSON.`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('METAPOPULATION_SNAPSHOT_CORRUPT', `${label} must be an object.`);
  }
  return value;
}

function parseArray(raw, label) {
  let value;
  try { value = JSON.parse(raw); } catch (_) { fail('METAPOPULATION_SNAPSHOT_CORRUPT', `${label} is invalid JSON.`); }
  if (!Array.isArray(value)) fail('METAPOPULATION_SNAPSHOT_CORRUPT', `${label} must be an array.`);
  return value;
}

function within(root, candidate) {
  if (!root || !candidate) return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function boundSession(context) {
  const { db, scope, agentId, workspaceId, sessionId } = context;
  const rows = await db.all(`SELECT s.*, w.path AS workspace_path
    FROM metapopulation_sessions s
    JOIN mission_agents ma ON ma.mission_id = s.mission_id
    JOIN agents a ON a.id = ma.agent_id
    JOIN workspaces w ON w.id = a.workspace_id
    WHERE s.id = ? AND a.id = ? AND w.id = ? AND (${scope.clause})`,
  sessionId, agentId, workspaceId, ...scope.params);
  if (rows.length !== 1) fail('METAPOPULATION_SNAPSHOT_OWNER_MISMATCH', 'Session, mission, agent and scoped workspace are not uniquely linked.');
  return rows[0];
}

function selectedVariant(session, requested) {
  const variant = String(requested).trim().toLowerCase().replaceAll('-', '_');
  if (!Object.hasOwn(VARIANTS, variant) || session.variant !== variant) {
    fail('METAPOPULATION_SNAPSHOT_VARIANT_MISMATCH', 'Persisted Metapopulation variant differs from the request.');
  }
  const policy = parseObject(session.variant_policy_json, 'Variant policy');
  if (digest(policy) !== digest(VARIANTS[variant])) {
    fail('METAPOPULATION_SNAPSHOT_POLICY_MISMATCH', 'Persisted variant policy differs from the registered policy.');
  }
  return { variant, policy };
}

async function boundDeme(context, session) {
  const rows = await context.db.all('SELECT deme_id, workspace_owner_id, workspace_path, members_json, status FROM metapopulation_demes WHERE metapopulation_id = ? ORDER BY deme_id', session.id);
  const owned = rows.filter((row) => parseArray(row.members_json, 'Deme members')
    .some((item) => (typeof item === 'string' ? item : item?.agentId || item?.agent_id || item?.id) === context.agentId));
  if (owned.length !== 1 || !await validDemeWorkspace(context, session, owned[0])) {
    fail('METAPOPULATION_SNAPSHOT_DEME_MISMATCH', 'Agent has no unique, verified attached deme workspace.');
  }
  return { id: owned[0].deme_id, status: owned[0].status, workspacePath: owned[0].workspace_path,
    workspaceOwnerId: owned[0].workspace_owner_id };
}

async function validDemeWorkspace(context, session, deme) {
  const owner = deme.workspace_owner_id;
  const location = deme.workspace_path;
  if (!owner || !location || !path.isAbsolute(location)) return false;
  if (owner === context.agentId) return within(session.workspace_path, location);
  if (owner.startsWith('metapop-deme-')) return path.basename(location) === owner;
  const lease = await context.db.get('SELECT lease_id FROM daemon_leases WHERE metapopulation_id = ? AND deme_id = ? AND daemon_id = ? LIMIT 1',
    session.id, deme.deme_id, owner);
  return Boolean(lease);
}

async function eventFrontier(db, sessionId) {
  const row = await db.get('SELECT COUNT(*) AS count, MAX(sequence) AS last_sequence, MAX(revision) AS last_revision FROM metapopulation_events WHERE metapopulation_id = ?', sessionId);
  const count = Number(row?.count || 0);
  const sequence = Number(row?.last_sequence || 0);
  if (count < 1 || count !== sequence) fail('METAPOPULATION_SNAPSHOT_EVENTS_INVALID', 'Regional event sequence is missing or non-contiguous.');
  return { count, sequence, revision: Number(row.last_revision || 0) };
}

async function groupReference(db, sessionId, group) {
  const [table, key] = GROUPS[group];
  const rows = await db.all(`SELECT * FROM ${table} WHERE metapopulation_id = ? ORDER BY ${key} LIMIT 10001`, sessionId);
  if (rows.length > 10000) fail('METAPOPULATION_SNAPSHOT_TOO_LARGE', `${group} exceeds 10,000 records.`);
  return { table, count: rows.length, lastId: rows.at(-1)?.[key] || null, hash: digest(rows) };
}

async function allReferences(db, sessionId) {
  const result = {};
  for (const group of Object.keys(GROUPS)) result[group] = await groupReference(db, sessionId, group);
  return result;
}

async function assertNoInFlight(db, sessionId) {
  const checks = [
    ['metapopulation_migrations', "status = 'QUARANTINED'"],
    ['metapopulation_colonizations', "status IN ('IN_TRIAL', 'COMPLETING')"],
    ['metapopulation_cycle_states', "status = 'RESUMED'"],
    ['ephemeral_leases', "active = 1 AND julianday(expires_at) > julianday('now')"],
    ['daemon_leases', "active = 1 AND julianday(expires_at) > julianday('now')"]
  ];
  for (const [table, predicate] of checks) {
    const row = await db.get(`SELECT 1 AS active FROM ${table} WHERE metapopulation_id = ? AND ${predicate} LIMIT 1`, sessionId);
    if (row) fail('METAPOPULATION_SNAPSHOT_IN_FLIGHT', `${table} has an active effect or lease.`);
  }
}

async function capture(context) {
  const session = await boundSession(context);
  if (!QUIET.has(session.status)) fail('METAPOPULATION_SNAPSHOT_ACTIVE', 'Regional session must be quiescent or closed.');
  const selected = selectedVariant(session, context.variantId);
  const deme = await boundDeme(context, session);
  await assertNoInFlight(context.db, session.id);
  const frontier = await eventFrontier(context.db, session.id);
  if (frontier.revision !== Number(session.revision)) {
    fail('METAPOPULATION_SNAPSHOT_FRONTIER_MISMATCH', 'Regional event frontier differs from session revision.');
  }
  const references = await allReferences(context.db, session.id);
  const current = await context.db.get('SELECT revision, status, updated_at FROM metapopulation_sessions WHERE id = ?', session.id);
  const latest = await eventFrontier(context.db, session.id);
  if (current?.revision !== session.revision || current.status !== session.status
    || current.updated_at !== session.updated_at || digest(latest) !== digest(frontier)) {
    fail('METAPOPULATION_SNAPSHOT_CONCURRENT_CHANGE', 'Regional session advanced during snapshot capture.');
  }
  const components = Object.entries(references).map(([group, reference]) => ({ id: group, status: 'reference-only', reference }));
  components.push({ id: 'variant-policy', status: 'captured', payload: {
    variant: selected.variant, policy: selected.policy,
    evidence: Object.fromEntries(VARIANT_EVIDENCE[selected.variant].map((key) => [key, references[key]]))
  } });
  return { policyVersion: 1, boundary: {
    sessionId: session.id, missionId: session.mission_id, status: session.status,
    organization: session.organization, persistenceScope: session.scope,
    revision: Number(session.revision), generation: Number(session.generation),
    updatedAt: session.updated_at, eventFrontier: frontier, demeId: deme.id,
    demeStatus: deme.status, workspacePath: deme.workspacePath,
    demeWorkspaceOwnerId: deme.workspaceOwnerId,
    regionalMemoryHash: digest(parseObject(session.regional_memory_json, 'Regional memory')),
    migrationGraphHash: digest(parseObject(session.migration_graph_json, 'Migration graph')),
    variantSelectionHash: digest(parseObject(session.variant_selection_json, 'Variant selection'))
  }, components };
}

async function preflightRestore(context, manifest) {
  if (!QUIET.has(manifest.boundary?.status)) return { ok: false, reasons: ['Regional session is active.'] };
  if (manifest.boundary?.sessionId !== context.sessionId) return { ok: false, reasons: ['Regional session identity changed.'] };
  return { ok: true, plan: { restore: 'workspace-only', regionalState: 'verify-only',
    receiverLocalValidation: true, demeId: manifest.boundary.demeId,
    eventSequence: manifest.boundary.eventFrontier.sequence,
    variant: context.variantId } };
}

module.exports = { capture, preflightRestore, VARIANT_EVIDENCE };
