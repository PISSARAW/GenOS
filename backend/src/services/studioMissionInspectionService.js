'use strict';

const episodes = require('./missionEpisodeService');
const { digest } = require('./biologicalIntegrity');
const { aggregateRows, aggregateMetabolicUsageByCell } = require('./metabolicLedgerService');
const { LINEAGE_SCHEMA } = require('./mcpExecutor/permissionMembraneBridge');
const { digest: permissionDigest } = require('./toolPermissionMembraneService');

const MAX_PAGE_SIZE = 100; const MAX_OFFSET = 100000;
const SENSITIVE_METADATA_KEYS = new Set(['token', 'secret', 'password',
  'credential', 'authorization', 'apikey']);

function safeMetadata(value) {
  if (Array.isArray(value)) return value.map(safeMetadata);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => {
    const name = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    return ![...SENSITIVE_METADATA_KEYS].some(sensitive => name.endsWith(sensitive));
  }).map(([key, nested]) => [key, safeMetadata(nested)]));
}

function failure(code, status, message) {
  return Object.assign(new Error(message || code), { code, status });
}

function boundedInteger(value, options) {
  const { fallback, minimum, maximum, field } = options;
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw failure('MISSION_INSPECTION_PAGINATION_INVALID', 400,
      `${field} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function pagination(query, prefix) {
  return {
    limit: boundedInteger(query[`${prefix}Limit`], {
      fallback: 50, minimum: 1, maximum: MAX_PAGE_SIZE, field: `${prefix}Limit`
    }),
    offset: boundedInteger(query[`${prefix}Offset`], {
      fallback: 0, minimum: 0, maximum: MAX_OFFSET, field: `${prefix}Offset`
    })
  };
}

function page(items, options) {
  const hasMore = items.length > options.limit;
  const visible = hasMore ? items.slice(0, options.limit) : items;
  return {
    items: visible, limit: options.limit, offset: options.offset, hasMore,
    nextOffset: hasMore ? options.offset + options.limit : null
  };
}

function scope(context) {
  return {
    organizationId: context.scope.organizationId,
    projectId: context.scope.projectId
  };
}

function episodeView(row) {
  return {
    episodeId: row.episode_id, missionId: row.mission_id,
    organismId: row.organism_id, organismRevision: row.organism_revision,
    epigenomeRevision: row.epigenome_revision, orchestratorId: row.orchestrator_id,
    rootThreadId: row.root_thread_id, status: row.status, revision: row.revision,
    habitatId: row.habitat_id, habitatRevision: row.habitat_revision,
    metadata: safeMetadata(JSON.parse(row.metadata_json)), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function threadView(row) {
  return {
    threadId: row.thread_id, parentThreadId: row.parent_thread_id,
    workerId: row.worker_id, cellKind: row.cell_kind, status: row.status,
    stopReason: row.stop_reason, checkpointId: row.checkpoint_id,
    contextSize: row.context_size, revision: row.revision,
    metadata: safeMetadata(JSON.parse(row.metadata_json)), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function receiptView(row) {
  return {
    receiptId: row.receipt_id, callId: row.call_id,
    tool: { name: row.tool_name, version: row.tool_version },
    worker: { id: row.worker_id, revision: row.worker_revision },
    decision: row.effective_decision, reason: row.decision_reason,
    decider: { type: row.decider_type, id: row.decider_id },
    leaseId: row.lease_id, policy: { id: row.policy_id, version: row.policy_version },
    argumentsHash: row.arguments_hash,
    authorizationHash: row.authorization_hash, resultStatus: row.result_status,
    resultHash: row.result_hash, receiptHash: row.receipt_hash,
    lineage: { schema: LINEAGE_SCHEMA, missionId: row.lineage_mission_id,
      episodeId: row.lineage_episode_id, threadId: row.lineage_thread_id,
      workerId: row.lineage_worker_id, hash: row.lineage_hash, exact: true },
    createdAt: row.created_at, settledAt: row.settled_at
  };
}

function recoveryReceiptView(row) {
  if (!row) return null;
  return {
    receiptId: row.receipt_id, episodeId: row.episode_id, missionId: row.mission_id,
    organizationId: row.organization_id, projectId: row.project_id,
    ownerAgentId: row.owner_agent_id, ownerRunId: row.owner_run_id,
    ownerPid: row.owner_pid, runtimePid: row.runtime_pid,
    authorityGeneration: row.authority_generation,
    observedAuthorityState: row.observed_authority_state,
    observedRunStatus: row.observed_run_status, outcome: row.outcome,
    quarantinedThreads: row.quarantined_threads, createdAt: row.created_at
  };
}

function lineageMaterial(row) {
  return {
    schema: LINEAGE_SCHEMA, receiptId: row.receipt_id,
    authorizationHash: row.authorization_hash,
    missionId: row.lineage_mission_id, episodeId: row.lineage_episode_id,
    threadId: row.lineage_thread_id, workerId: row.lineage_worker_id,
    organizationId: row.lineage_organization_id, projectId: row.lineage_project_id
  };
}

function verifyLineage(row, input) {
  const exact = row.lineage_mission_id === input.episode.mission_id
    && row.lineage_episode_id === input.episode.episode_id
    && row.lineage_organization_id === input.scope.organizationId
    && row.lineage_project_id === input.scope.projectId
    && row.lineage_worker_id === row.worker_id
    && row.lineage_organization_id === row.organization_id
    && row.lineage_project_id === row.project_id
    && row.lineage_authorization_hash === row.authorization_hash
    && permissionDigest(lineageMaterial(row)) === row.lineage_hash;
  if (!exact) throw failure('MISSION_INSPECTION_PERMISSION_LINEAGE_INVALID', 409);
  return row;
}

async function threadPage(db, input) {
  const rows = await db.all(`SELECT * FROM cell_threads
    WHERE episode_id = ? AND mission_id = ? AND organization_id = ? AND project_id = ?
    ORDER BY created_at, thread_id LIMIT ? OFFSET ?`, input.episode.episode_id,
  input.episode.mission_id, input.scope.organizationId, input.scope.projectId,
  input.page.limit + 1, input.page.offset);
  return page(rows.map(threadView), input.page);
}

async function receiptPage(db, input) {
  const rows = await db.all(`SELECT r.*,
      l.mission_id AS lineage_mission_id, l.episode_id AS lineage_episode_id,
      l.thread_id AS lineage_thread_id, l.organization_id AS lineage_organization_id,
      l.project_id AS lineage_project_id, l.worker_id AS lineage_worker_id,
      l.authorization_hash AS lineage_authorization_hash, l.lineage_hash
    FROM tool_permission_receipts r
    JOIN tool_permission_receipt_lineage l ON l.receipt_id = r.receipt_id
    JOIN cell_threads t ON t.thread_id = l.thread_id AND t.episode_id = l.episode_id
      AND t.mission_id = l.mission_id AND t.organization_id = l.organization_id
      AND t.project_id = l.project_id AND t.worker_id = l.worker_id
    WHERE l.organization_id = ? AND l.project_id = ?
      AND l.mission_id = ? AND l.episode_id = ?
    ORDER BY r.created_at, r.receipt_id LIMIT ? OFFSET ?`, input.scope.organizationId,
  input.scope.projectId, input.episode.mission_id, input.episode.episode_id,
  input.page.limit + 1, input.page.offset);
  const legacy = await db.get(`SELECT COUNT(*) AS count FROM tool_permission_receipts r
    LEFT JOIN tool_permission_receipt_lineage l ON l.receipt_id = r.receipt_id
    WHERE r.organization_id = ? AND r.project_id = ? AND l.receipt_id IS NULL`,
  input.scope.organizationId, input.scope.projectId);
  const verified = rows.map((row) => verifyLineage(row, input)).map(receiptView);
  return { ...page(verified, input.page),
    legacyUncorrelated: { count: legacy.count, exact: false, reason: 'lineage_absent' } };
}

function sameScope(row, tenant) {
  return row.organization_id === tenant.organizationId && row.project_id === tenant.projectId;
}

function verifiedHabitatRevision(row) {
  if (!row) throw failure('MISSION_INSPECTION_HABITAT_REVISION_NOT_FOUND', 409);
  const configuration = JSON.parse(row.configuration_json);
  if (digest(configuration) !== row.content_hash) {
    throw failure('MISSION_INSPECTION_HABITAT_INTEGRITY_INVALID', 409);
  }
  return {
    habitatId: row.habitat_id, revision: row.revision, contentHash: row.content_hash,
    previousHash: row.previous_hash, configuration, createdAt: row.created_at
  };
}

async function habitat(db, missionId, tenant) {
  const binding = await db.get('SELECT * FROM mission_habitat_bindings WHERE mission_id = ?', missionId);
  if (!binding) return null;
  if (!sameScope(binding, tenant)) {
    throw failure('MISSION_INSPECTION_HABITAT_SCOPE_DENIED', 403);
  }
  const row = await db.get(`SELECT * FROM habitat_revisions WHERE habitat_id = ?
    AND revision = ? AND organization_id = ? AND project_id = ?`, binding.habitat_id,
  binding.habitat_revision, tenant.organizationId, tenant.projectId);
  const revision = verifiedHabitatRevision(row);
  const material = { missionId, habitatId: binding.habitat_id,
    habitatRevision: binding.habitat_revision, habitatHash: revision.contentHash,
    tenant };
  if (digest(material) !== binding.binding_hash) {
    throw failure('MISSION_INSPECTION_HABITAT_INTEGRITY_INVALID', 409);
  }
  return { binding: { ...material, bindingHash: binding.binding_hash }, revision };
}

async function legacyMetabolicCount(db, missionId, tenant) {
  const row = await db.get(`SELECT COUNT(*) AS count
    FROM metabolic_ledger_observations WHERE mission_id = ?
      AND organization_id = ? AND project_id = ?
      AND (episode_id IS NULL OR thread_id IS NULL OR worker_id IS NULL)`,
  missionId, tenant.organizationId, tenant.projectId);
  return row.count;
}

function exactCellAggregates(aggregate, threads) {
  const indexed = new Map(aggregate.cells.map((cell) => [
    JSON.stringify([cell.threadId, cell.workerId]), cell
  ]));
  return threads.items.map((thread) => indexed.get(JSON.stringify([
    thread.threadId, thread.workerId
  ]))).filter(Boolean);
}

async function metabolism(db, input) {
  const { episode, tenant, threads } = input;
  const missionId = episode.mission_id;
  const rows = await db.all(`SELECT m.metric, m.value, m.source
    FROM metabolic_ledger_measurements m
    JOIN metabolic_ledger_observations o ON o.observation_id = m.observation_id
    WHERE o.mission_id = ? AND o.organization_id = ? AND o.project_id = ?
      AND o.episode_id = ?
    ORDER BY o.observed_at, o.observation_id, m.metric`, missionId,
  tenant.organizationId, tenant.projectId, episode.episode_id);
  const [aggregate, legacyCount] = await Promise.all([
    aggregateMetabolicUsageByCell(db, { missionId, episodeId: episode.episode_id, ...tenant }),
    legacyMetabolicCount(db, missionId, tenant)
  ]);
  const exactThreadRows = await db.all(`SELECT thread_id, worker_id FROM cell_threads
    WHERE episode_id = ? AND mission_id = ? AND organization_id = ? AND project_id = ?`,
  episode.episode_id, missionId, tenant.organizationId, tenant.projectId);
  const exactKeys = new Set(exactThreadRows.map((row) => JSON.stringify([
    row.thread_id, row.worker_id
  ])));
  const uncorrelatedCount = aggregate.cells.filter((cell) => !cell.threadId || !cell.workerId
    || !exactKeys.has(JSON.stringify([cell.threadId, cell.workerId]))).length;
  const exactAggregate = { ...aggregate, cells: aggregate.cells.filter((cell) => cell.threadId
    && cell.workerId && exactKeys.has(JSON.stringify([cell.threadId, cell.workerId]))) };
  return { missionId, metrics: aggregateRows(rows), byCell: {
    items: exactCellAggregates(exactAggregate, threads),
    limit: threads.limit, offset: threads.offset,
    hasMore: threads.hasMore, nextOffset: threads.nextOffset,
    correlation: { method: 'persisted_metabolic_cell_lineage', appliesTo: 'items',
      exact: true, complete: legacyCount === 0 && uncorrelatedCount === 0,
      legacy: legacyCount > 0 },
    legacyUncorrelated: { count: legacyCount, exact: false, reason: 'cell_lineage_incomplete' },
    uncorrelated: { count: uncorrelatedCount, exact: false, reason: 'cell_thread_not_found' }
  } };
}

async function episodeRecovery(db, episode, tenant) {
  const row = await db.get(`SELECT * FROM mission_episode_recovery_receipts
    WHERE episode_id = ? AND mission_id = ? AND organization_id = ? AND project_id = ?
    ORDER BY authority_generation DESC, created_at DESC, receipt_id DESC LIMIT 1`,
  episode.episode_id, episode.mission_id, tenant.organizationId, tenant.projectId);
  return { receipt: recoveryReceiptView(row), correlation: {
    method: 'persisted_episode_scope_key', selection: 'latest_authority_generation',
    exact: true, complete: true, legacy: false
  } };
}

function checkpointView(row) {
  const resumed = Boolean(row.resumption_id);
  return {
    checkpointId: row.checkpoint_id, threadId: row.thread_id, workerId: row.worker_id,
    threadRevision: row.thread_revision, threadState: row.thread_state,
    contextSize: row.context_size, createdAt: row.checkpoint_created_at,
    resumeState: resumed ? 'resumed' : 'not_observed',
    resumption: resumed ? { resumptionId: row.resumption_id,
      previousRevision: row.previous_revision, resumedRevision: row.resumed_revision,
      previousState: row.previous_state, resumedState: row.resumed_state,
      createdAt: row.resumption_created_at } : null
  };
}

async function checkpointPage(db, input) {
  const args = [input.episode.episode_id, input.episode.mission_id,
    input.scope.organizationId, input.scope.projectId];
  const rows = await db.all(`SELECT c.checkpoint_id, c.thread_id, c.worker_id,
      c.thread_revision, c.thread_state, c.context_size,
      c.created_at AS checkpoint_created_at, r.resumption_id, r.previous_revision,
      r.resumed_revision, r.previous_state, r.resumed_state,
      r.created_at AS resumption_created_at
    FROM cell_thread_checkpoints c JOIN cell_threads t
      ON t.thread_id = c.thread_id AND t.episode_id = c.episode_id
      AND t.mission_id = c.mission_id AND t.organization_id = c.organization_id
      AND t.project_id = c.project_id AND t.worker_id = c.worker_id
    LEFT JOIN cell_thread_checkpoint_resumptions r ON r.checkpoint_id = c.checkpoint_id
      AND r.thread_id = c.thread_id AND r.worker_id = c.worker_id
      AND r.episode_id = c.episode_id AND r.mission_id = c.mission_id
      AND r.organization_id = c.organization_id AND r.project_id = c.project_id
    WHERE c.episode_id = ? AND c.mission_id = ? AND c.organization_id = ?
      AND c.project_id = ? ORDER BY c.created_at, c.checkpoint_id LIMIT ? OFFSET ?`,
  ...args, input.page.limit + 1, input.page.offset);
  const legacy = await db.get(`SELECT COUNT(*) AS count FROM cell_thread_checkpoints c
    LEFT JOIN cell_threads t ON t.thread_id = c.thread_id AND t.episode_id = c.episode_id
      AND t.mission_id = c.mission_id AND t.organization_id = c.organization_id
      AND t.project_id = c.project_id AND t.worker_id = c.worker_id
    WHERE c.episode_id = ? AND c.mission_id = ? AND c.organization_id = ?
      AND c.project_id = ? AND t.thread_id IS NULL`, ...args);
  return { ...page(rows.map(checkpointView), input.page), correlation: {
    method: 'persisted_cell_checkpoint_lineage', exact: true,
    complete: legacy.count === 0, legacy: legacy.count > 0,
    integrityVerified: false, integrity: 'not_evaluated'
  }, legacyUncorrelated: { count: legacy.count, exact: false } };
}

function controlView(row) {
  const pending = row.command_status === 'pending';
  const linked = Boolean(row.receipt_id);
  const matches = linked && row.receipt_outcome === row.command_status
    && row.receipt_result_code === row.command_result_code;
  const reconcile = !pending && (!matches
    || String(row.command_result_code).includes('RECONCILIATION_REQUIRED'));
  const assessment = pending ? 'pending' : reconcile ? 'reconciliation_required'
    : `persisted_${row.command_status}_unverified`;
  return {
    commandId: row.command_id, threadId: row.thread_id, workerId: row.worker_id,
    action: row.action, expectedThreadRevision: row.expected_thread_revision,
    status: row.command_status, resultCode: row.command_result_code,
    revision: row.command_revision, createdAt: row.command_created_at,
    finalizedAt: row.finalized_at, assessment, pending,
    reconciliationRequired: reconcile, indeterminate: true,
    receipt: linked ? { receiptId: row.receipt_id, outcome: row.receipt_outcome,
      resultCode: row.receipt_result_code, createdAt: row.receipt_created_at,
      integrityVerified: false, integrity: 'unknown' } : null
  };
}

async function controlPage(db, input) {
  const args = [input.episode.episode_id, input.episode.mission_id,
    input.scope.organizationId, input.scope.projectId];
  const rows = await db.all(`SELECT c.command_id, c.thread_id, t.worker_id, c.action,
      c.expected_thread_revision, c.status AS command_status,
      c.result_code AS command_result_code, c.revision AS command_revision,
      c.created_at AS command_created_at, c.finalized_at, r.receipt_id,
      r.outcome AS receipt_outcome, r.result_code AS receipt_result_code,
      r.created_at AS receipt_created_at
    FROM operator_control_commands c JOIN cell_threads t
      ON t.thread_id = c.thread_id AND t.episode_id = c.episode_id
      AND t.mission_id = c.mission_id AND t.organization_id = c.organization_id
      AND t.project_id = c.project_id
    LEFT JOIN operator_control_receipts r ON r.command_id = c.command_id
    WHERE c.episode_id = ? AND c.mission_id = ? AND c.organization_id = ?
      AND c.project_id = ? ORDER BY c.created_at, c.command_id LIMIT ? OFFSET ?`,
  ...args, input.page.limit + 1, input.page.offset);
  return { ...page(rows.map(controlView), input.page), correlation: {
    method: 'persisted_operator_command_target', exact: true, complete: false,
    legacy: false, receiptLink: 'command_id_foreign_key',
    integrityVerified: false, integrity: 'unknown',
    integrityReason: 'receipt_hash_not_recomputed'
  } };
}

async function inspect(db, context) {
  const tenant = scope(context);
  const episode = await episodes.requireScoped(db, {
    ...tenant, missionId: context.missionId, episodeId: context.episodeId
  });
  const threadOptions = pagination(context.query || {}, 'thread');
  const receiptOptions = pagination(context.query || {}, 'receipt');
  const checkpointOptions = pagination(context.query || {}, 'checkpoint');
  const controlOptions = pagination(context.query || {}, 'control');
  const threads = await threadPage(db, { episode, scope: tenant, page: threadOptions });
  const [habitatState, metabolic, permissionReceipts, recovery, checkpoints, controls] = await Promise.all([
    habitat(db, episode.mission_id, tenant),
    metabolism(db, { episode, tenant, threads }),
    receiptPage(db, { episode, scope: tenant, page: receiptOptions }),
    episodeRecovery(db, episode, tenant),
    checkpointPage(db, { episode, scope: tenant, page: checkpointOptions }),
    controlPage(db, { episode, scope: tenant, page: controlOptions })
  ]);
  return {
    missionId: episode.mission_id, episode: episodeView(episode), threads,
    habitat: habitatState, metabolism: metabolic, episodeRecovery: recovery,
    cellCheckpoints: checkpoints, operatorControls: controls,
    permissionReceipts: { ...permissionReceipts, correlation: {
      method: 'persisted_backend_receipt_lineage', exact: true,
      appliesTo: 'items', complete: permissionReceipts.legacyUncorrelated.count === 0,
      legacy: permissionReceipts.legacyUncorrelated.count > 0
    } },
    readOnly: true
  };
}

module.exports = { inspect, MAX_PAGE_SIZE, MAX_OFFSET };
