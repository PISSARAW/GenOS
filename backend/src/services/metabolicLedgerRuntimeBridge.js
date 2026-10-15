'use strict';

const crypto = require('crypto');
const ledger = require('./metabolicLedgerService');

function metric(value, source, provenance = {}) {
  if (source === 'unavailable') {
    return { source, unavailableReason: provenance.reason };
  }
  if (source === 'estimated') {
    return { value, source, estimationMethod: provenance.method };
  }
  if (source === 'provider_receipt') {
    return { value, source, evidenceRef: provenance.evidenceRef };
  }
  return { value, source };
}

function receiptRef(result) {
  const responseId = result.usageReceipt?.responseId;
  return responseId ? `provider-response:${responseId}`
    : `model-attempt:${result.routeAttemptId}`;
}

function tokenSource(result) {
  if (result.tokenUsageSource === 'not_called') return 'exact';
  if (result.tokenUsageSource === 'unknown') return 'unavailable';
  if (result.tokenUsageMeasured === true || result.tokenUsageSource === 'provider') {
    return 'provider_receipt';
  }
  return 'estimated';
}

function tokenMetric(value, source, result) {
  if (source === 'unavailable') {
    return metric(null, source, { reason: 'model provider omitted usable token usage' });
  }
  return metric(value, source, {
    evidenceRef: receiptRef(result), method: 'provider fallback utf8-bytes/4 estimator'
  });
}

function optionalReceiptMetric(receipt, key, result) {
  const value = receipt?.[key];
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return metric(value, 'provider_receipt', { evidenceRef: receiptRef(result) });
}

function modelMeasurements(result) {
  const source = tokenSource(result);
  const input = source === 'unavailable' ? null : result.inputTokens;
  const output = source === 'unavailable' ? null : result.outputTokens;
  const measurements = {
    inputTokens: tokenMetric(input, source, result),
    outputTokens: tokenMetric(output, source, result)
  };
  const cacheRead = optionalReceiptMetric(result.usageReceipt, 'cacheReadTokens', result);
  const cacheCreation = optionalReceiptMetric(result.usageReceipt, 'cacheCreationTokens', result);
  if (cacheRead) measurements.cacheReadTokens = cacheRead;
  if (cacheCreation) measurements.cacheCreationTokens = cacheCreation;
  measurements.billableTokens = billableMetric(result,
    { source, input, output, cacheRead });
  measurements.catalogCostUsd = catalogCostMetric(result);
  measurements.billedCostUsd = metric(null, 'unavailable', {
    reason: 'provider receipt did not include a billed amount'
  });
  if (Number.isFinite(result.latencyMs) && result.latencyMs >= 0) {
    measurements.wallTimeMs = metric(result.latencyMs, 'exact');
  }
  return measurements;
}

function billableMetric(result, values) {
  if (values.source === 'unavailable') return tokenMetric(null, values.source, result);
  const cached = values.cacheRead ? values.cacheRead.value : 0;
  const value = Math.max(0, values.input - Math.min(values.input, cached) + values.output);
  return tokenMetric(value, values.source, result);
}

function catalogCostMetric(result) {
  if (result.providerCalled === false || result.tokenUsageSource === 'not_called') {
    return metric(0, 'exact');
  }
  if (!result.catalogPricingKnown || !Number.isFinite(result.costUsd) || result.costUsd < 0) {
    return metric(null, 'unavailable', { reason: 'registered catalog pricing unavailable' });
  }
  return metric(result.costUsd, 'estimated', { method: 'registered provider catalog rates' });
}

async function recordModelUsage(db, scope, result) {
  if (!(scope.executionRunId || scope.missionId) || !(await metabolicLedgerAvailable(db))) return false;
  try {
    const lineage = await resolveLineage(db, modelLineage(scope));
    await ledger.recordMetabolicObservation(db, modelObservation(scope, result, lineage));
    return true;
  } catch (error) {
    if (ignorableWriteError(error)) return false;
    throw error;
  }
}

async function metabolicLedgerAvailable(db) {
  if (!db || typeof db.run !== 'function' || typeof db.get !== 'function') return false;
  const table = await db.get(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'metabolic_ledger_observations'`);
  return table?.name === 'metabolic_ledger_observations';
}

function modelObservation(scope, result, lineage) {
  return {
    id: `metabolic-model-${result.routeAttemptId}-${result.attemptStatus || 'completed'}`,
    missionId: lineage.missionId || scope.missionId || scope.executionRunId,
    episodeId: lineage.episodeId, threadId: lineage.threadId,
    workerId: lineage.workerId,
    organizationId: lineage.organizationId, projectId: lineage.projectId,
    provider: result.provider || providerFrom(result.model),
    model: result.servedModel || result.model, operationId: result.routeAttemptId,
    measurements: modelMeasurements(result), metadata: {
      producer: 'model-attempt-ledger', attemptStatus: result.attemptStatus,
      agentId: scope.agentId || null, executionRunId: scope.executionRunId || null,
      lineageSource: lineage.source, transportSuccess: result.success !== false
    }
  };
}

function ignorableWriteError(error) {
  if (error?.code === 'SQLITE_CONSTRAINT') return /UNIQUE|PRIMARY KEY/i.test(error.message || '');
  if (error?.code === 'SQLITE_ERROR') return /no such table: metabolic_ledger_/i.test(error.message || '');
  return false;
}

function providerFrom(model) {
  const match = String(model || '').match(/^([\w-]+):\/\//);
  return match ? match[1] : null;
}

function runtimeMeasurements(ctx, finishedAtMs = Date.now()) {
  const measurements = {};
  if (ctx.tokenUsageUnknown) {
    measurements.billableTokens = metric(null, 'unavailable', {
      reason: 'runtime emitted malformed or incomplete token usage'
    });
  } else if (ctx.tokenUsageObserved) {
    measurements.billableTokens = metric(ctx.exactTokens, 'exact');
  } else {
    measurements.billableTokens = metric(ctx.estimatedTokens, 'estimated', {
      method: 'runtime prompt and message utf8-bytes/4 estimator'
    });
  }
  measurements.runtimeCostUsd = runtimeCostMetric(ctx);
  const startedAt = Number(ctx.mission?.runtimeStartedAt);
  if (Number.isFinite(startedAt) && startedAt > 0) {
    measurements.wallTimeMs = metric(Math.max(0, finishedAtMs - startedAt), 'exact');
  }
  return measurements;
}

function runtimeCostMetric(ctx) {
  if (ctx.costUsageUnknown) return metric(null, 'unavailable', {
    reason: 'runtime emitted malformed cost usage'
  });
  if (!ctx.costUsageObserved) return metric(null, 'unavailable', {
    reason: 'runtime emitted no cost measurement'
  });
  return metric(ctx.observedCostUsd, 'exact');
}

async function recordRuntimeUsage(db, ctx) {
  const missionId = ctx.mission?.missionId;
  if (!missionId || !(await metabolicLedgerAvailable(db))) return false;
  const lineage = await resolveLineage(db, runtimeLineage(ctx, missionId));
  await ledger.recordMetabolicObservation(db, runtimeObservation(ctx, lineage));
  return true;
}

function runtimeObservation(ctx, lineage) {
  const finishedAt = runtimeFinishedAt(ctx);
  const startedAt = runtimeStartedAt(ctx);
  const operationId = runtimeOperation(ctx, lineage);
  const digest = crypto.createHash('sha256').update([
    lineage.missionId, lineage.episodeId, lineage.threadId,
    lineage.workerId, operationId, startedAt
  ].join('\0')).digest('hex').slice(0, 32);
  return {
    id: `metabolic-runtime-${digest}`, missionId: lineage.missionId,
    episodeId: lineage.episodeId, threadId: lineage.threadId,
    workerId: lineage.workerId,
    organizationId: lineage.organizationId, projectId: lineage.projectId,
    provider: 'codex-runtime', model: optional(ctx.mission.modelId),
    operationId, startedAt, finishedAt,
    observedAt: finishedAt, measurements: runtimeMeasurements(ctx, Date.parse(finishedAt)),
    metadata: { producer: 'agent-runtime', agentId: optional(ctx.mission.agentId),
      lineageSource: lineage.source,
      exitCode: optional(ctx.code), signal: optional(ctx.signal),
      budgetStopped: optional(ctx.budgetStopped) }
  };
}

function optional(value) {
  return value == null ? null : value;
}

function runtimeOperation(ctx, lineage) {
  return optional(ctx.mission.executionRunId) || lineage.threadId || lineage.workerId;
}

function runtimeStartedAt(ctx) {
  if (!Number.isFinite(ctx.mission.runtimeStartedAt)) return null;
  return new Date(ctx.mission.runtimeStartedAt).toISOString();
}

function runtimeFinishedAt(ctx) {
  if (!ctx.metabolicLedgerFinishedAt) {
    ctx.metabolicLedgerFinishedAt = new Date().toISOString();
  }
  return ctx.metabolicLedgerFinishedAt;
}

function explicitLineage(input) {
  return { missionId: optional(input.missionId), episodeId: optional(input.episodeId),
    threadId: optional(input.threadId), workerId: optional(input.workerId),
    organizationId: optional(input.organizationId), projectId: optional(input.projectId),
    source: 'backend_scope_unverified' };
}

function modelLineage(scope) {
  return explicitLineage({ ...scope, workerId: scope.workerId || scope.agentId,
    missionId: scope.missionId });
}

function runtimeLineage(ctx, missionId) {
  const mission = ctx.mission;
  return explicitLineage({ missionId, episodeId: mission.episodeId,
    threadId: mission.threadId,
    workerId: mission.workerId || mission.agentId,
    organizationId: mission.organizationId, projectId: mission.projectId });
}

async function cellThreadsAvailable(db) {
  if (typeof db.all !== 'function') return false;
  const table = await db.get(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'cell_threads'`);
  return table?.name === 'cell_threads';
}

function lineageMatches(row, input) {
  const fields = [['missionId', 'mission_id'], ['episodeId', 'episode_id'],
    ['threadId', 'thread_id'], ['organizationId', 'organization_id'],
    ['projectId', 'project_id']];
  return fields.every(([field, column]) => !input[field] || input[field] === row[column]);
}

function degradedLineage(input, source) {
  return { missionId: input.missionId, episodeId: null, threadId: null, workerId: null,
    organizationId: input.organizationId, projectId: input.projectId, source };
}

function verifiedLineage(row) {
  return { missionId: row.mission_id, episodeId: row.episode_id,
    threadId: row.thread_id, workerId: row.worker_id,
    organizationId: row.organization_id, projectId: row.project_id,
    source: 'backend_cell_thread' };
}

function scopeCollision() {
  return Object.assign(new Error('Metabolic cell scope conflicts with backend lineage.'), {
    code: 'METABOLIC_CELL_SCOPE_COLLISION'
  });
}

async function resolveLineage(db, input) {
  if (!input.workerId) return degradedLineage(input, 'backend_lineage_unavailable');
  if (!(await cellThreadsAvailable(db))) {
    return degradedLineage(input, 'backend_lineage_unavailable');
  }
  const rows = await db.all(`SELECT mission_id, episode_id, thread_id, worker_id,
      organization_id, project_id FROM cell_threads
    WHERE worker_id = ?
      AND status IN ('ready', 'active', 'waiting_signal', 'waiting_permission')
    ORDER BY updated_at DESC LIMIT 3`, input.workerId);
  if (!rows.length) return degradedLineage(input, 'backend_lineage_unavailable');
  const matches = rows.filter((row) => lineageMatches(row, input));
  if (!matches.length) throw scopeCollision();
  if (matches.length > 1) return degradedLineage(input, 'backend_lineage_ambiguous');
  return verifiedLineage(matches[0]);
}

module.exports = { modelMeasurements, recordModelUsage, runtimeMeasurements, recordRuntimeUsage };
