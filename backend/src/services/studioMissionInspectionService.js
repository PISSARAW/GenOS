'use strict';

const episodes = require('./missionEpisodeService');
const { digest } = require('./biologicalIntegrity');
const { aggregateRows } = require('./metabolicLedgerService');

const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 100000;

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
    metadata: JSON.parse(row.metadata_json), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function threadView(row) {
  return {
    threadId: row.thread_id, parentThreadId: row.parent_thread_id,
    workerId: row.worker_id, cellKind: row.cell_kind, status: row.status,
    stopReason: row.stop_reason, checkpointId: row.checkpoint_id,
    contextSize: row.context_size, revision: row.revision,
    metadata: JSON.parse(row.metadata_json), createdAt: row.created_at, updatedAt: row.updated_at
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
    argumentsHash: row.arguments_hash, requestHash: row.request_hash,
    authorizationHash: row.authorization_hash, resultStatus: row.result_status,
    resultHash: row.result_hash, receiptHash: row.receipt_hash,
    createdAt: row.created_at, settledAt: row.settled_at
  };
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
  const rows = await db.all(`SELECT r.* FROM tool_permission_receipts r
    WHERE r.organization_id = ? AND r.project_id = ? AND r.created_at >= ?
      AND EXISTS (SELECT 1 FROM cell_threads t WHERE t.episode_id = ?
        AND t.mission_id = ? AND t.organization_id = r.organization_id
        AND t.project_id = r.project_id AND t.worker_id = r.worker_id)
    ORDER BY r.created_at, r.receipt_id LIMIT ? OFFSET ?`, input.scope.organizationId,
  input.scope.projectId, input.episode.created_at, input.episode.episode_id,
  input.episode.mission_id, input.page.limit + 1, input.page.offset);
  return page(rows.map(receiptView), input.page);
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

async function metabolism(db, missionId, tenant) {
  const rows = await db.all(`SELECT m.metric, m.value, m.source
    FROM metabolic_ledger_measurements m
    JOIN metabolic_ledger_observations o ON o.observation_id = m.observation_id
    WHERE o.mission_id = ? AND o.organization_id = ? AND o.project_id = ?
    ORDER BY o.observed_at, o.observation_id, m.metric`, missionId,
  tenant.organizationId, tenant.projectId);
  return { missionId, metrics: aggregateRows(rows) };
}

async function inspect(db, context) {
  const tenant = scope(context);
  const episode = await episodes.requireScoped(db, {
    ...tenant, missionId: context.missionId, episodeId: context.episodeId
  });
  const threadOptions = pagination(context.query || {}, 'thread');
  const receiptOptions = pagination(context.query || {}, 'receipt');
  const [threads, habitatState, metabolic, permissionReceipts] = await Promise.all([
    threadPage(db, { episode, scope: tenant, page: threadOptions }),
    habitat(db, episode.mission_id, tenant),
    metabolism(db, episode.mission_id, tenant),
    receiptPage(db, { episode, scope: tenant, page: receiptOptions })
  ]);
  return {
    missionId: episode.mission_id, episode: episodeView(episode), threads,
    habitat: habitatState, metabolism: metabolic,
    permissionReceipts: { ...permissionReceipts, correlation: {
      method: 'tenant_worker_identity_since_episode_start', exact: false
    } },
    readOnly: true
  };
}

module.exports = { inspect, MAX_PAGE_SIZE, MAX_OFFSET };
