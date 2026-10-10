'use strict';

const { digest, refusal } = require('../topologySnapshotContract');
const variants = require('../biome/variants/variantPolicyService');

const QUIESCENT = new Set(['dormant', 'completed', 'failed']);
const VARIANT_FIELDS = Object.freeze({
  resource: ['resourcePool', 'populations'],
  exploration: ['opportunityMap', 'environment'],
  quality_diversity: ['niches', 'populations'],
  successional: ['ecologicalState', 'niches'],
  resilience: ['resourcePool', 'ecologicalState'],
  persistent: ['ecologicalState', 'environment'],
  open_ended: ['niches', 'opportunityMap'],
  adversarial: ['interactionGraph', 'archive'],
  knowledge: ['environment', 'niches'],
  compute: ['resourcePool', 'populations'],
  multi_scale: ['populations', 'niches', 'ecologicalState']
});

function fail(code, message) { throw refusal(code, message); }

function parse(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) { /* corrupted persisted record */ }
  fail('BIOME_SNAPSHOT_CORRUPT', `${label} is not a JSON object.`);
}

function tenantScope(scope) {
  const tenant = scope?.clause === 'w.organization_id = ? AND w.project_id = ?'
    && Array.isArray(scope.params) && scope.params.length === 2
    && scope.params.every((value) => typeof value === 'string' && value.length > 0);
  const local = scope?.clause === 'w.organization_id IS NULL AND w.project_id IS NULL'
    && Array.isArray(scope.params) && scope.params.length === 0;
  if (!tenant && !local) fail('BIOME_SNAPSHOT_SCOPE_INVALID', 'Workspace tenant scope is invalid.');
  return scope;
}

async function boundSession(context) {
  const { db, agentId, workspaceId, sessionId } = context;
  const scope = tenantScope(context.scope);
  const agent = await db.get('SELECT workspace_id, metadata_json, status FROM agents WHERE id = ?', agentId);
  const workspace = await db.get(`SELECT w.id FROM workspaces w WHERE w.id = ? AND ${scope.clause}`,
    workspaceId, ...scope.params);
  const row = await db.get("SELECT state_json, revision FROM topology_sessions WHERE id = ? AND topology = 'biome'", sessionId);
  if (!agent || !workspace || !row || agent.workspace_id !== workspaceId) {
    fail('BIOME_SNAPSHOT_OWNER_MISMATCH', 'Biome session, agent and scoped workspace are not bound.');
  }
  const metadata = parse(agent.metadata_json, 'Biome agent metadata');
  if (metadata.topologySessionId !== sessionId) {
    fail('BIOME_SNAPSHOT_OWNER_MISMATCH', 'Agent is not persisted as a member of this Biome session.');
  }
  if (['running', 'Active'].includes(agent.status)) {
    fail('BIOME_SNAPSHOT_ACTIVE', 'Biome agent is still executing.');
  }
  const state = parse(row.state_json, 'Biome session');
  validateState(context, { row, state });
  return { row, state };
}

function validateState(context, record) {
  const { row, state } = record;
  if (!identityValid(context, state) || !revisionValid(row, state)
    || !ecologyValid(state.ecology) || !matrixValid(state.matrix)) {
    fail('BIOME_SNAPSHOT_CORRUPT', 'Biome identity, revision, ecology or biofilm is incomplete.');
  }
}

function identityValid(context, state) {
  return state.biomeId === context.sessionId && state.ecology?.biomeId === context.sessionId
    && state.ecology?.missionId === context.sessionId;
}

function revisionValid(row, state) {
  if (!Number.isSafeInteger(row.revision) || row.revision < 0) return false;
  return state.revision === row.revision || (row.revision === 0 && state.revision == null);
}

function ecologyValid(ecology) {
  return Boolean(ecology && Array.isArray(ecology.niches) && Array.isArray(ecology.populations)
    && Array.isArray(ecology.interactionGraph) && ecology.environment);
}

function matrixValid(matrix) {
  return Boolean(matrix && Array.isArray(matrix.entries) && Array.isArray(matrix.history)
    && Number.isSafeInteger(matrix.version));
}

function selectedVariant(context, state) {
  const selected = state.variant;
  if (!Object.hasOwn(VARIANT_FIELDS, selected) || !variants.list().includes(selected)
    || state.variantPolicy?.variant !== selected || state.variantSelection?.variant !== selected) {
    fail('BIOME_SNAPSHOT_VARIANT_UNKNOWN', 'Persisted Biome variant selection is incomplete.');
  }
  if (context.variantId !== 'default' && context.variantId !== selected) {
    fail('BIOME_SNAPSHOT_VARIANT_MISMATCH', 'Persisted Biome variant differs from request.');
  }
  return selected;
}

async function journal(db, sessionId, revision) {
  const rows = await db.all(`SELECT revision, event_type, payload_json FROM topology_session_events
    WHERE session_id = ? AND topology = 'biome' ORDER BY revision`, sessionId);
  if (rows.length !== revision || rows.some((row, index) => row.revision !== index + 1)) {
    fail('BIOME_SNAPSHOT_JOURNAL_GAP', 'Biome event journal does not cover the session revision.');
  }
  for (const row of rows) parse(row.payload_json, 'Biome event');
  return rows;
}

async function persistentEnvironment(db, state) {
  if (state.scope !== 'persistent') {
    if (state.persistenceKey || state.persistenceRevision != null) {
      fail('BIOME_SNAPSHOT_PERSISTENCE_CONFLICT', 'Nonpersistent Biome has a persistent environment binding.');
    }
    return null;
  }
  if (!state.persistenceKey || !Number.isSafeInteger(state.persistenceRevision)) {
    fail('BIOME_SNAPSHOT_PERSISTENCE_CONFLICT', 'Persistent Biome has no environment revision.');
  }
  const row = await db.get('SELECT state_json, revision FROM persistent_biome_environments WHERE id = ?', state.persistenceKey);
  if (!row || row.revision !== state.persistenceRevision) {
    fail('BIOME_SNAPSHOT_PERSISTENCE_CONFLICT', 'Persistent environment revision differs from session.');
  }
  return { key: state.persistenceKey, revision: row.revision,
    sha256: digest(parse(row.state_json, 'Persistent Biome environment')) };
}

function variantEvidence(variant, state) {
  const ecology = state.ecology;
  const stateHashes = Object.fromEntries(VARIANT_FIELDS[variant]
    .map((field) => [field, digest(ecology[field] ?? null)]));
  const specialized = {
    resource: ['allocations', 'minimumAllocationRatio'],
    exploration: ['explorationHistory', 'environmentThreshold'],
    quality_diversity: ['qualityDiversity', 'diversityTarget'],
    successional: ['successionPhase', 'phases'],
    resilience: ['recoveryReserve', 'recoveryReserveRatio'],
    persistent: ['seasons', 'persistence'],
    open_ended: ['discoveredNiches', 'growthThreshold'],
    adversarial: ['armsRace', 'strategyLineages', 'exploitArchive'],
    knowledge: ['sourceNiches', 'sourceEvidence'],
    compute: ['computeAllocation', 'computeAware'],
    multi_scale: ['scaleMetrics', 'levels']
  }[variant];
  return { variant, scope: state.scope, policyHash: digest(state.variantPolicy),
    selectionHash: digest(state.variantSelection), stateHashes,
    specializedHashes: Object.fromEntries(specialized.map((field) =>
      [field, digest(state.variantState?.[field] ?? state.variantPolicy?.[field] ?? null)])) };
}

function quiescent(state) {
  const runtime = state.ecology.ecologicalState?.runtime;
  return QUIESCENT.has(state.ecology.status) && runtime?.running !== true;
}

async function capture(context) {
  const { row, state } = await boundSession(context);
  const variant = selectedVariant(context, state);
  if (!quiescent(state)) fail('BIOME_SNAPSHOT_ACTIVE', 'Biome ecology is active or its runtime is running.');
  const events = await journal(context.db, context.sessionId, row.revision);
  const persistent = await persistentEnvironment(context.db, state);
  const current = await context.db.get("SELECT state_json, revision FROM topology_sessions WHERE id = ? AND topology = 'biome'", context.sessionId);
  if (!current || current.revision !== row.revision || current.state_json !== row.state_json) {
    fail('BIOME_SNAPSHOT_CONCURRENT_CHANGE', 'Biome session changed during capture.');
  }
  const ecology = state.ecology;
  const components = [
    { id: 'session-state', status: 'reference-only', reference: { sha256: digest(state), revision: row.revision } },
    { id: 'ecology', status: 'reference-only', reference: { sha256: digest(ecology),
      environmentVersion: ecology.environment.version, tick: ecology.tick,
      niches: ecology.niches.length, populations: ecology.populations.length } },
    { id: 'biofilm', status: 'reference-only', reference: { sha256: digest(state.matrix),
      version: state.matrix.version, entries: state.matrix.entries.length } },
    { id: 'event-journal', status: 'reference-only', reference: { sha256: digest(events), count: events.length } },
    { id: 'variant-policy', status: 'captured', payload: variantEvidence(variant, state) }
  ];
  if (persistent) components.push({ id: 'persistent-environment', status: 'reference-only', reference: persistent });
  return { policyVersion: 1, boundary: { revision: row.revision, variant, ecologyStatus: ecology.status,
    ecologyTick: ecology.tick, environmentVersion: ecology.environment.version,
    biofilmVersion: state.matrix.version, persistenceRevision: persistent?.revision ?? null }, components };
}

async function preflightRestore(context, manifest) {
  const { state } = await boundSession(context);
  if (!quiescent(state)) return { ok: false, reasons: ['Biome ecology is active.'] };
  if (manifest.boundary.variant !== state.variant) return { ok: false, reasons: ['Biome variant changed.'] };
  return { ok: true, plan: { type: 'verify-only', variant: state.variant,
    journalRevision: manifest.boundary.revision, environmentVersion: manifest.boundary.environmentVersion,
    biofilmVersion: manifest.boundary.biofilmVersion,
    note: 'Shared ecology, biofilm, budgets and external actions are verified, not rolled back.' } };
}

module.exports = { capture, preflightRestore };
