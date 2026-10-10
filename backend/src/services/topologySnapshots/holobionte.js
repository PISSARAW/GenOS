'use strict';

const { digest, refusal } = require('../topologySnapshotContract');
const { getVariant } = require('../holobionte/variants');

const POLICY_VERSION = 1;
const REMOTE_VARIANTS = new Set([
  'cloud-core/edge-symbionts', 'edge-core/cloud-symbionts', 'cloud-core/edge-sync'
]);
const VARIANT_FIELDS = Object.freeze({
  organelle: ['dependencyGraph', 'transmissionState'],
  'adaptive-microbiome': ['ecologicalState', 'residentSymbionts'],
  'immune-critical': ['immuneState', 'residentSymbionts'],
  'local-first': ['resourceState', 'residentSymbionts'],
  regenerative: ['dependencyGraph', 'immuneState'],
  'cloud-core/edge-symbionts': ['resourceState', 'residentSymbionts'],
  'edge-core/cloud-symbionts': ['resourceState', 'residentSymbionts'],
  'memory-rich': ['transmissionState', 'immuneState'],
  'competitive-partner': ['ecologicalState', 'verifiedContributions'],
  procedural: ['variantState', 'resourceState'],
  tool: ['variantState', 'resourceState'],
  'cloud-core/edge-sync': ['variantState', 'transmissionState']
});

function fail(code, message) { throw refusal(code, message); }

function parseJson(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) { /* invalid persisted JSON */ }
  fail('HOLOBIONTE_SNAPSHOT_CORRUPT', `${label} is not a JSON object.`);
}

function tenantScope(scope) {
  const tenant = scope?.clause === 'w.organization_id = ? AND w.project_id = ?'
    && Array.isArray(scope.params) && scope.params.length === 2
    && scope.params.every((value) => typeof value === 'string' && value.length > 0);
  const local = scope?.clause === 'w.organization_id IS NULL AND w.project_id IS NULL'
    && Array.isArray(scope.params) && scope.params.length === 0;
  if (!tenant && !local) fail('HOLOBIONTE_SNAPSHOT_SCOPE_INVALID', 'Workspace tenant scope is invalid.');
  return scope;
}

async function boundSession(context) {
  const { db, agentId, workspaceId, sessionId } = context;
  const scope = tenantScope(context.scope);
  const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agentId);
  const workspace = await db.get(`SELECT id, organization_id, project_id FROM workspaces w
    WHERE w.id = ? AND ${scope.clause}`, workspaceId, ...scope.params);
  const row = await db.get('SELECT * FROM holobiont_sessions WHERE holobiont_id = ?', sessionId);
  if (!ownerMatches(context, { agent, workspace, row })) {
    fail('HOLOBIONTE_SNAPSHOT_OWNER_MISMATCH', 'Host, session, workspace and tenant bindings do not match.');
  }
  const session = parseJson(row.session_json, 'Holobiont session');
  if (!sessionMatches(context, { row, session })) {
    fail('HOLOBIONTE_SNAPSHOT_CORRUPT', 'Persisted Holobiont session disagrees with its indexed state.');
  }
  return { row, session };
}

function ownerMatches(context, state) {
  const { agent, workspace, row } = state;
  return Boolean(agent && workspace && row
    && agent.workspace_id === context.workspaceId
    && row.host_id === context.agentId
    && row.workspace_id === context.workspaceId
    && (!row.project_id || row.project_id === workspace.project_id));
}

function sessionMatches(context, state) {
  const { row, session } = state;
  return session.holobiontId === context.sessionId && session.hostId === context.agentId
    && session.workspaceId === context.workspaceId && session.revision === row.revision
    && session.status === row.status;
}

function selectedVariant(context, session) {
  const selected = session.variantState?.variantId;
  let variant;
  try { variant = getVariant(selected).name; } catch (_) {
    fail('HOLOBIONTE_SNAPSHOT_VARIANT_UNKNOWN', 'Holobiont has no recognized persisted variant.');
  }
  const requested = context.variantId === 'default' ? variant : context.variantId;
  if (requested !== variant || !VARIANT_FIELDS[variant]
    || session.variantState?.selectionReceipt?.variantId !== variant) {
    fail('HOLOBIONTE_SNAPSHOT_VARIANT_MISMATCH', 'Persisted selection receipt and requested variant differ.');
  }
  return variant;
}

function assertJournal(session, events, lifecycle) {
  const revisions = [...events, ...lifecycle].map((row) => row.revision).sort((a, b) => a - b);
  if (revisions.length !== session.revision || revisions.some((revision, index) => revision !== index + 1)) {
    fail('HOLOBIONTE_SNAPSHOT_JOURNAL_GAP', 'Holobiont revision journal is incomplete.');
  }
  for (const row of [...events, ...lifecycle]) parseJson(row.payload_json, 'Holobiont event');
  assertSelection(session, events);
}

function assertSelection(session, events) {
  const selections = events.filter((row) => row.event_type === 'VARIANT_SELECTED');
  const latest = selections[selections.length - 1];
  const selected = latest && parseJson(latest.payload_json, 'Variant selection');
  if (!selected || selected.variantId !== session.variantState?.variantId
    || digest(selected.selectionReceipt ?? null) !== digest(session.variantState?.selectionReceipt ?? null)
    || digest(selected.policy ?? null) !== digest(session.variantState?.policy ?? null)) {
    fail('HOLOBIONTE_SNAPSHOT_RECEIPT_CONFLICT', 'Persisted variant selection differs from its immutable receipt.');
  }
}

function assertContracts(session, contracts) {
  if (contracts.some((row) => row.host_id !== session.hostId || row.holobiont_id !== session.holobiontId)) {
    fail('HOLOBIONTE_SNAPSHOT_RECEIPT_CONFLICT', 'Symbiosis contract has a foreign host.');
  }
  for (const row of contracts) parseJson(row.contract_json, 'Symbiosis contract');
}

function assertLedger(session, contracts, ledger) {
  const contractKeys = new Map(contracts.map((row) => [`${row.contract_id}:${row.revision}`, row]));
  if (ledger.some((row) => row.holobiont_id !== session.holobiontId
    || contractKeys.get(`${row.contract_id}:${row.contract_revision}`)?.symbiont_id !== row.symbiont_id
    || !row.receipt_id || !row.verifier_id || !row.result_hash)) {
    fail('HOLOBIONTE_SNAPSHOT_RECEIPT_CONFLICT', 'Contribution receipt is unbound or incomplete.');
  }
}

function assertMemories(session, memories) {
  if (memories.some((row) => row.host_id !== session.hostId
    || row.source_holobiont_id !== session.holobiontId
    || (row.workspace_id && row.workspace_id !== session.workspaceId))) {
    fail('HOLOBIONTE_SNAPSHOT_RECEIPT_CONFLICT', 'Symbiotic memory belongs to another host or workspace.');
  }
  for (const row of memories) parseJson(row.content_json, 'Symbiotic memory');
}

async function immutableRows(db, session) {
  const id = session.holobiontId;
  const events = await db.all('SELECT * FROM holobiont_events WHERE holobiont_id = ? ORDER BY revision', id);
  const lifecycle = await db.all('SELECT * FROM holobiont_lifecycle_events WHERE holobiont_id = ? ORDER BY revision', id);
  const contracts = await db.all('SELECT * FROM holobiont_symbiosis_contracts WHERE holobiont_id = ? ORDER BY contract_id, revision', id);
  const ledger = await db.all('SELECT * FROM holobiont_symbiosis_ledger WHERE holobiont_id = ? ORDER BY ledger_id', id);
  const memories = await db.all('SELECT * FROM holobiont_memories WHERE source_holobiont_id = ? ORDER BY memory_id, revision', id);
  assertJournal(session, events, lifecycle);
  assertContracts(session, contracts);
  assertLedger(session, contracts, ledger);
  assertMemories(session, memories);
  return { events, lifecycle, contracts, ledger, memories };
}

function rowReference(rows) { return { count: rows.length, sha256: digest(rows) }; }

async function assertStableRows(db, sessionId, rows) {
  const sources = [
    ['events', 'holobiont_events', 'holobiont_id'],
    ['lifecycle', 'holobiont_lifecycle_events', 'holobiont_id'],
    ['contracts', 'holobiont_symbiosis_contracts', 'holobiont_id'],
    ['ledger', 'holobiont_symbiosis_ledger', 'holobiont_id'],
    ['memories', 'holobiont_memories', 'source_holobiont_id']
  ];
  for (const [key, table, field] of sources) {
    const count = await db.get(`SELECT COUNT(*) AS count FROM ${table} WHERE ${field} = ?`, sessionId);
    if (Number(count?.count) !== rows[key].length) {
      fail('HOLOBIONTE_SNAPSHOT_CONCURRENT_CHANGE', `${key} changed during capture.`);
    }
  }
}

function variantComponent(variant, session, rows) {
  const fields = VARIANT_FIELDS[variant];
  const stateHashes = Object.fromEntries(fields.map((field) => [field, digest(session[field] ?? null)]));
  const evaluations = session.variantState?.evaluations || [];
  if (!Array.isArray(evaluations)) fail('HOLOBIONTE_SNAPSHOT_CORRUPT', 'Variant evaluations are invalid.');
  return { id: 'variant-policy', status: 'reference-only', reference: {
    variant, selectionHash: digest(session.variantState.selectionReceipt),
    policyHash: digest(session.variantState.policy), stateHashes,
    evaluationCount: evaluations.length, evaluationHash: digest(evaluations),
    eventTypes: [...new Set(rows.events.map((row) => row.event_type))].sort()
  } };
}

function remoteComponent(variant, session) {
  if (!REMOTE_VARIANTS.has(variant) && variant !== 'tool') return null;
  return { id: 'external-effects', status: 'reference-only', reference: {
    variant, placementHash: digest(session.variantState?.policy?.placement ?? null),
    synchronizationHash: digest(session.variantState?.policy?.synchronization ?? null),
    note: 'Remote state and tool effects require independent verification; they are not restored.'
  } };
}

async function capture(context) {
  const { row, session } = await boundSession(context);
  const variant = selectedVariant(context, session);
  const rows = await immutableRows(context.db, session);
  await assertStableRows(context.db, context.sessionId, rows);
  const current = await context.db.get('SELECT revision, status, updated_at FROM holobiont_sessions WHERE holobiont_id = ?', context.sessionId);
  if (current?.revision !== row.revision || current.status !== row.status || current.updated_at !== row.updated_at) {
    fail('HOLOBIONTE_SNAPSHOT_CONCURRENT_CHANGE', 'Holobiont session changed during capture.');
  }
  const references = Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, rowReference(value)]));
  const components = [
    { id: 'host-constitution', status: 'reference-only', reference: {
      hostId: session.hostId, constitutionId: session.constitutionId,
      constitutionHash: digest(session.constitution ?? null), scope: session.scope
    } },
    { id: 'symbionts', status: 'reference-only', reference: {
      residentsHash: digest(session.residentSymbionts), candidatesHash: digest(session.candidateSymbionts),
      dependencyHash: digest(session.dependencyGraph)
    } },
    { id: 'host-state', status: 'reference-only', reference: {
      immuneHash: digest(session.immuneState), resourcesHash: digest(session.resourceState),
      memoryHash: references.memories.sha256, ecologyHash: digest(session.ecologicalState)
    } },
    { id: 'immutable-receipts', status: 'reference-only', reference: references },
    variantComponent(variant, session, rows)
  ];
  const external = remoteComponent(variant, session);
  if (external) components.push(external);
  return { policyVersion: POLICY_VERSION, boundary: {
    holobiontId: session.holobiontId, hostId: session.hostId, workspaceId: session.workspaceId,
    status: row.status, revision: row.revision, updatedAt: row.updated_at,
    journal: references.events, lifecycle: references.lifecycle,
    contracts: references.contracts, ledger: references.ledger, memories: references.memories
  }, components };
}

async function preflightRestore(context, manifest) {
  if (!['QUIESCENT', 'CLOSED'].includes(manifest?.boundary?.status)) {
    return { ok: false, reasons: ['Holobiont host is not quiescent or closed.'] };
  }
  const { session } = await boundSession(context);
  if (session.candidateSymbionts?.some((item) => item.status === 'TRIAL')) {
    return { ok: false, reasons: ['An admission trial is still in progress.'] };
  }
  return { ok: true, plan: { restore: 'workspace-only', collectiveState: 'verify-only',
    immutableReceipts: 'preserve', externalEffects: 'verify-independently',
    holobiontId: context.sessionId, revision: manifest.boundary.revision } };
}

module.exports = { capture, preflightRestore, VARIANT_FIELDS };
