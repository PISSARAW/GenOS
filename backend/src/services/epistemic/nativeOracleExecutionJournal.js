'use strict';

const journal = require('./nativeOracleJournal');
const domains = require('./nativeOracleDomains');
const values = require('../trinityProvenanceValues');

function strategies(allocation) { return [...domains.definition(allocation.value.domain).checks.STRATEGIES]; }
function kind(strategy, phase) { return `execution_${strategy}_${phase}`; }

function observer(db, allocation) {
  return async execution => {
    if (!strategies(allocation).includes(execution.strategy) || !['intent', 'finished'].includes(execution.phase)) {
      throw values.failure('ORACLE_EXECUTION_SCOPE_INVALID');
    }
    const request = { runId: allocation.value.runId, scope: allocation.value.scope,
      kind: kind(execution.strategy, execution.phase) };
    if (await journal.read(db, request)) throw values.failure('ORACLE_EXECUTION_ALREADY_RECORDED');
    if (execution.phase === 'finished') {
      const intent = await journal.read(db, { ...request, kind: kind(execution.strategy, 'intent') });
      assertFinished(intent, { execution, allocation });
    }
    return journal.append(db, { kind: request.kind, scope: allocation.value.scope,
      record: { schema: 'genos.native-oracle-execution/v1', runId: allocation.value.runId,
        agentId: allocation.value.agentId, allocationHash: allocation.hash, execution } });
  };
}

function assertFinished(intent, input) {
  if (!intent || intent.value.allocationHash !== input.allocation.hash) throw values.failure('ORACLE_EXECUTION_BINDING_INVALID');
  const fields = ['executionId', 'strategy', 'cwd', 'inputDigest', 'executable', 'implementation', 'startedAt', 'timeoutMs'];
  if (fields.some(field => intent.value.execution[field] !== input.execution[field])) throw values.failure('ORACLE_EXECUTION_BINDING_INVALID');
  if (!Number.isFinite(input.execution.durationMs) || input.execution.durationMs < 0) throw values.failure('ORACLE_EXECUTION_COST_INVALID');
}

async function costs(db, { allocation }) {
  if (allocation.value.executionAccounting !== 'genos.native-oracle-execution/v1') return legacyCosts(allocation);
  const observations = [];
  let unresolved = 0;
  for (const strategy of strategies(allocation)) {
    const request = { runId: allocation.value.runId, scope: allocation.value.scope };
    const intent = await journal.read(db, { ...request, kind: kind(strategy, 'intent') });
    const finished = await journal.read(db, { ...request, kind: kind(strategy, 'finished') });
    assertRecord(intent, { allocation, strategy, phase: 'intent' });
    assertRecord(finished, { allocation, strategy, phase: 'finished' });
    if (!intent && !finished) continue;
    if (!finished) { unresolved += 1; continue; }
    assertFinished(intent, { execution: finished.value.execution, allocation });
    if (finished.value.allocationHash !== allocation.hash) throw values.failure('ORACLE_EXECUTION_BINDING_INVALID');
    observations.push(finished.value.execution);
  }
  return summarize(observations, unresolved, allocation.value.limits);
}

function summarize(observations, unresolved, limits) {
  const observedProcesses = observations.filter(item => Number.isSafeInteger(item.processId) && item.processId > 0).length;
  const observedRuntimeMs = observations.reduce((total, item) => total + item.durationMs, 0);
  return { processes: unresolved ? null : observedProcesses, runtimeMs: unresolved ? null : observedRuntimeMs,
    observedProcesses, observedRuntimeMs, unresolvedExecutions: unresolved, complete: unresolved === 0,
    reservedExecutions: limits.executions, accountingSchema: 'genos.native-oracle-execution/v1',
    modelTokens: 0, providerUsd: 0, localComputeUsd: null };
}

function legacyCosts(allocation) {
  return { processes: null, runtimeMs: null, observedProcesses: 0, observedRuntimeMs: 0,
    unresolvedExecutions: allocation.value.limits.executions, reservedExecutions: allocation.value.limits.executions,
    accountingSchema: 'legacy_untracked', complete: false, modelTokens: 0, providerUsd: 0, localComputeUsd: null };
}

function assertRecord(saved, input) {
  if (!saved) return;
  const record = saved.value;
  const expected = { schema: 'genos.native-oracle-execution/v1', runId: input.allocation.value.runId,
    agentId: input.allocation.value.agentId, allocationHash: input.allocation.hash };
  if (Object.keys(expected).some(key => record[key] !== expected[key])) throw values.failure('ORACLE_EXECUTION_BINDING_INVALID');
  if (record.execution.phase !== input.phase || record.execution.strategy !== input.strategy) throw values.failure('ORACLE_EXECUTION_BINDING_INVALID');
}

async function abort(db, input) {
  const allocation = input.allocation;
  const request = { runId: allocation.value.runId, scope: allocation.value.scope, kind: 'abort' };
  if (await journal.read(db, request)) return;
  await journal.append(db, { kind: 'abort', scope: request.scope,
    record: { schema: 'genos.native-oracle-abort/v1', runId: request.runId, allocationHash: allocation.hash,
      reason: input.failure.code || input.failure.message, costs: await costs(db, { allocation }),
      abortedAt: new Date().toISOString(), accepted: false } });
}

module.exports = { observer, costs, abort };
