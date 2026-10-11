'use strict';

const store = require('../biocenose/communityStore');
const policies = require('../biocenose/variants/variantPolicyRouter');
const { constitutionHash } = require('../biocenose/governance/protocolVersioning');
const journal = require('../biocenose/runtime/roundJournal');
const { digest, refusal } = require('../topologySnapshotContract');

const TABLES = Object.freeze([
  'biocenose_members', 'biocenose_constitutions', 'biocenose_commitments',
  'biocenose_claims', 'biocenose_claim_owners', 'biocenose_arguments',
  'biocenose_belief_updates', 'biocenose_dissent', 'biocenose_judgments',
  'biocenose_calibration', 'biocenose_events'
]);
const TERMINAL = new Set(['DECIDED', 'ESCALATED', 'CLOSED']);
const VARIANT_SOURCES = Object.freeze({
  epistemic_jury: ['biocenose_commitments', 'biocenose_claims', 'biocenose_judgments'],
  delphi_community: ['biocenose_commitments', 'biocenose_belief_updates', 'biocenose_events'],
  adversarial_assembly: ['biocenose_arguments', 'biocenose_dissent', 'biocenose_events'],
  forecasting_crowd: ['biocenose_calibration', 'biocenose_judgments'],
  argumentation_community: ['biocenose_claims', 'biocenose_arguments', 'biocenose_claim_owners'],
  polycentric_council: ['biocenose_members', 'biocenose_events', 'biocenose_dissent'],
  byzantine_resilient_community: ['biocenose_members', 'biocenose_events', 'biocenose_claims'],
  minority_preserving_jury: ['biocenose_dissent', 'biocenose_events', 'biocenose_judgments'],
  representative_community: ['biocenose_members', 'biocenose_events', 'biocenose_judgments'],
  persistent_community: ['biocenose_calibration', 'biocenose_events', 'biocenose_judgments'],
  human_ai_deliberation: ['biocenose_events', 'biocenose_dissent', 'biocenose_judgments'],
  hybrid_oracle_community: ['biocenose_claims', 'biocenose_events', 'biocenose_judgments']
});

function fail(code, message) { throw refusal(code, message); }

function recordHash(value) { return digest(JSON.parse(JSON.stringify(value))); }

async function tableExists(db, name) {
  const row = await db.get("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?", name);
  return Boolean(row);
}

function scopedWorkspace(scope, workspace) {
  const params = scope?.params;
  const clause = scope?.clause;
  if (!Array.isArray(params) || typeof clause !== 'string') return false;
  return params.length === 2
    ? scopedTenant(params, clause, workspace) : scopedLegacy(params, clause, workspace);
}

function scopedTenant(params, clause, workspace) {
  return /organization_id\s*=\s*\?/i.test(clause)
    && /project_id\s*=\s*\?/i.test(clause)
    && workspace.organization_id === params[0] && workspace.project_id === params[1];
}

function scopedLegacy(params, clause, workspace) {
  return params.length === 0 && /organization_id\s+IS\s+NULL/i.test(clause)
    && /project_id\s+IS\s+NULL/i.test(clause)
    && workspace.organization_id == null && workspace.project_id == null;
}

async function boundSession(context) {
  const session = await store.loadSession(context.db, context.sessionId);
  if (!session) fail('BIOCENOSE_SNAPSHOT_UNKNOWN', 'Biocenose community was not found.');
  const agent = await context.db.get('SELECT workspace_id, status FROM agents WHERE id = ?', context.agentId);
  const workspace = await context.db.get(
    'SELECT organization_id, project_id FROM workspaces WHERE id = ?', context.workspaceId);
  const member = await context.db.get(
    'SELECT 1 AS linked FROM biocenose_members WHERE community_id = ? AND member_id = ?',
    context.sessionId, context.agentId);
  let missionMember = null;
  if (session.missionId && await tableExists(context.db, 'mission_agents')) {
    missionMember = await context.db.get(
      'SELECT 1 AS linked FROM mission_agents WHERE mission_id = ? AND agent_id = ?',
      session.missionId, context.agentId);
  }
  if (!agent || !workspace || agent.workspace_id !== context.workspaceId
    || !scopedWorkspace(context.scope, workspace) || (!member && !missionMember)) {
    fail('BIOCENOSE_SNAPSHOT_OWNER_MISMATCH', 'Agent, community and scoped workspace are not bound.');
  }
  return { session, agentStatus: agent.status, workspace };
}

async function committedConstitution(context, session) {
  const record = await store.latestConstitution(context.db, session.communityId);
  if (!record || record.constitutionId !== session.constitutionId
    || constitutionHash(record.constitution) !== record.constitutionHash) {
    fail('BIOCENOSE_SNAPSHOT_CONSTITUTION_INVALID', 'Committed constitution is missing or invalid.');
  }
  const selected = policies.select(record.constitution.variant);
  if (context.variantId !== 'default' && context.variantId !== selected.name) {
    fail('BIOCENOSE_SNAPSHOT_VARIANT_MISMATCH', 'Requested variant differs from the committed constitution.');
  }
  policies.assertCompatible(selected, session.questionType);
  return { record, selected };
}

async function tableReferences(db, communityId) {
  const references = {};
  for (const name of TABLES) {
    const rows = await db.all(`SELECT * FROM ${name} WHERE community_id = ?`, communityId);
    const rowHashes = rows.map(recordHash).sort();
    references[name] = { count: rows.length, stateHash: digest(rowHashes) };
  }
  return references;
}

async function historicalConstitutionHashes(db, communityId) {
  const constitutions = await db.all(
    'SELECT constitution_json, constitution_hash FROM biocenose_constitutions WHERE community_id = ?',
    communityId);
  const hashes = new Set();
  for (const item of constitutions) {
    let parsed;
    try { parsed = JSON.parse(item.constitution_json); } catch (_) {
      fail('BIOCENOSE_SNAPSHOT_CONSTITUTION_INVALID', 'Historical constitution is invalid JSON.');
    }
    if (constitutionHash(parsed) !== item.constitution_hash) {
      fail('BIOCENOSE_SNAPSHOT_CONSTITUTION_INVALID', 'Historical constitution hash mismatch.');
    }
    hashes.add(item.constitution_hash);
  }
  return hashes;
}

async function verifyRoundReceipts(input) {
  const { context, session, events, hashes } = input;
  const completed = events.filter((event) => event.type === 'DELIBERATION_STEP_COMPLETED');
  if (completed.some((event) => !Number.isInteger(event.payload.round)
    || event.payload.round < 0 || event.payload.round > session.round)) {
    fail('BIOCENOSE_SNAPSHOT_ROUND_INTEGRITY', 'Round receipt has an invalid round.');
  }
  for (let round = 0; round <= session.round; round += 1) {
    const steps = completed.filter((event) => event.payload.round === round);
    if (!steps.length) continue;
    const protocolHash = steps[0].payload.constitutionHash;
    if (!hashes.has(protocolHash)) {
      fail('BIOCENOSE_SNAPSHOT_ROUND_INTEGRITY', 'Round references an unknown constitution.');
    }
    await journal.load({ db: context.db, communityId: session.communityId,
      round, constitutionHash: protocolHash });
  }
}

async function eventBoundary(context, session) {
  const events = await store.listEvents(context.db, session.communityId);
  if (events.length !== session.revision + 1
    || events.some((event, index) => event.revision !== index)) {
    fail('BIOCENOSE_SNAPSHOT_EVENT_GAP', 'Community event revisions are not contiguous.');
  }
  const hashes = await historicalConstitutionHashes(context.db, session.communityId);
  await verifyRoundReceipts({ context, session, events, hashes });
  return { eventCount: events.length, lastRevision: session.revision,
    eventTypes: [...new Set(events.map((event) => event.type))].sort() };
}

async function leaseBoundary(db, communityId) {
  if (!await tableExists(db, 'biocenose_runtime_leases')) return null;
  const lease = await db.get(
    'SELECT expires_at FROM biocenose_runtime_leases WHERE community_id = ?', communityId);
  return lease ? { expiresAt: Number(lease.expires_at), active: Number(lease.expires_at) > Date.now() } : null;
}

function variantReference(selected, references, event) {
  return {
    variant: selected.name, policyHash: digest(selected),
    sources: VARIANT_SOURCES[selected.name].map((name) => ({ table: name, ...references[name] })),
    requiredEvidence: {
      minimumRounds: selected.minimumRounds,
      humanReview: selected.requireHumanReview,
      deterministicVerifier: selected.requireDeterministicVerifier,
      calibrationWeights: selected.requireCalibrationWeights,
      samplingWeights: selected.requireSamplingWeights,
      preserveAllDissent: selected.preserveAllDissent,
      quarantineAware: selected.quarantineAware
    },
    eventTypes: event.eventTypes
  };
}

async function capture(context) {
  const bound = await boundSession(context);
  const { session } = bound;
  const { record, selected } = await committedConstitution(context, session);
  const [references, event, lease] = await Promise.all([
    tableReferences(context.db, session.communityId),
    eventBoundary(context, session),
    leaseBoundary(context.db, session.communityId)
  ]);
  const fresh = await store.loadSession(context.db, session.communityId);
  if (fresh.revision !== session.revision || recordHash(fresh) !== recordHash(session)) {
    fail('BIOCENOSE_SNAPSHOT_CONCURRENT_CHANGE', 'Community changed during capture.');
  }
  return { policyVersion: 1, boundary: {
    communityId: session.communityId, missionId: session.missionId,
    revision: session.revision, round: session.round, phase: session.phase,
    status: session.status, agentStatus: bound.agentStatus,
    organizationId: bound.workspace.organization_id, projectId: bound.workspace.project_id,
    lease, ...event
  }, components: [
    { id: 'community', status: 'reference-only', reference: {
      sessionHash: recordHash(session), constitutionId: record.constitutionId,
      constitutionVersion: record.version, constitutionHash: record.constitutionHash
    } },
    { id: 'collective-ledger', status: 'reference-only', reference: references },
    { id: 'variant-evidence', status: 'reference-only',
      reference: variantReference(selected, references, event) }
  ] };
}

async function preflightRestore(context, manifest) {
  const boundary = manifest.boundary;
  if (!TERMINAL.has(boundary.status)) {
    return { ok: false, reasons: ['Biocenose community is still active.'] };
  }
  if (boundary.agentStatus === 'running' || boundary.lease?.active) {
    return { ok: false, reasons: ['Biocenose agent or runtime lease is active.'] };
  }
  const variant = manifest.components.find((item) => item.id === 'variant-evidence')?.reference;
  if (!variant || !Object.hasOwn(VARIANT_SOURCES, variant.variant)) {
    return { ok: false, reasons: ['Variant evidence reference is missing.'] };
  }
  const refs = manifest.components.find((item) => item.id === 'collective-ledger')?.reference;
  if (!refs || (boundary.status === 'DECIDED' && refs.biocenose_judgments?.count < 1)) {
    return { ok: false, reasons: ['Final community judgment is missing.'] };
  }
  if (variant.requiredEvidence.minimumRounds > boundary.round + 1) {
    return { ok: false, reasons: ['Variant minimum deliberation rounds were not reached.'] };
  }
  return { ok: true, plan: { restore: 'workspace-only', collectiveState: 'verify-only',
    communityId: boundary.communityId, revision: boundary.revision,
    variant: variant.variant, replayEvents: false, replayVotes: false } };
}

module.exports = { capture, preflightRestore };
