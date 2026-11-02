'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const source = require('./allostasisSource');
const native = require('./allostasisRuntime');
const context = require('./context');
const clocks = new Map();
const { withTransaction } = require('../../db');

async function prepare(ctx) {
  if (!ctx.normalizedMission.missionId || ctx.dispatchedAgent.execution_mode !== 'worker') return;
  const capacity = ctx.executionRun.budget.latencyMs;
  const ordinary = capacity - Math.floor(capacity / 20);
  const mission = ctx.normalizedMission;
  mission.timeoutMs = Math.min(mission.timeoutMs || ordinary, ordinary);
  mission.executionDeadlineAt = Math.min(Number(mission.executionDeadlineAt) || Infinity, Date.now() + mission.timeoutMs);
}

async function admitAndExpose(binding) {
  await context.assertCurrent(binding);
  const regulator = await source.regulator(binding);
  if (!regulator) return { status: 'not_applicable', reason: 'no_parent_regulator' };
  const runtime = native.open(binding, regulator);
  try {
    const admitted = await native.admit(binding, runtime);
    await runtime.usage.ready;
    const active = runtime.allocator.store.raw.prepare('SELECT body FROM mission_time_runtime WHERE id=?').get(binding.runId);
    const state = JSON.parse(active.body);
    if (state.startedAt != null) throw context.failure('MISSION_ALLOSTASIS_RECONCILIATION_REQUIRED');
    const exposure = await runtime.usage.expose({ query: admitted.query, operationId: binding.runId,
      maximumAmount: admitted.amount, purpose: 'work' });
    if (exposure.status !== 'exposure_recorded' || exposure.reconciliationRequired) {
      throw context.failure('MISSION_ALLOSTASIS_RECONCILIATION_REQUIRED');
    }
    state.startedAt = Date.now();
    runtime.allocator.store.raw.prepare('UPDATE mission_time_runtime SET body=? WHERE id=?').run(JSON.stringify(state), binding.runId);
    clocks.set(binding.runId, { start: process.hrtime.bigint(), directory: binding.directory });
    return { status: 'admitted', query: admitted.query, maximumMilliseconds: admitted.amount };
  } finally { runtime.allocator.close(); }
}

async function finishLocked(binding) {
  await native.accountingAuthority(binding);
  const clock = clocks.get(binding.runId);
  const held = native.historical(binding);
  if (!held) return null;
  const regulator = held.regulator;
  const runtime = native.open(binding, regulator);
  try {
    await runtime.usage.ready;
    const row = runtime.allocator.store.raw.prepare('SELECT body FROM mission_time_runtime WHERE id=?').get(binding.runId);
    if (!row) return null;
    const state = JSON.parse(row.body);
    if (state.finished) return state.finished;
    const receiptId = `${binding.runId}:quiescent-time`;
    const previous = runtime.allocator.store.raw.prepare('SELECT body FROM mission_time_receipts WHERE id=?').get(receiptId);
    const measured = clock?.directory === binding.directory ? Number((process.hrtime.bigint() - clock.start + 999999n) / 1000000n) : null;
    const receipt = previous ? JSON.parse(previous.body) : { query: state.query, operationId: binding.runId, evidenceRef: receiptId,
      status: measured === null ? 'unknown' : 'known', cumulativeAmount: measured,
      final: measured !== null, source: measured === null ? 'unavailable' : 'exact' };
    const amount = receipt.cumulativeAmount;
    runtime.allocator.store.raw.prepare('INSERT OR IGNORE INTO mission_time_receipts VALUES(?,?)').run(receiptId, JSON.stringify(receipt));
    const result = await runtime.usage.apply(native.message(binding, { type: 'REPORT_USAGE', audience: regulator,
      accounting: true, payload: { allocationId: state.query.allocationId, allocationDigest: state.query.allocationDigest,
        operationId: binding.runId, receiptId, cumulativeAmount: amount, status: receipt.status,
        unit: 'milliseconds', evidenceRef: receiptId } }));
    const released = await runtime.usage.apply(native.message(binding, { type: 'RELEASE', audience: regulator,
      accounting: true, payload: { allocationId: state.query.allocationId, allocationDigest: state.query.allocationDigest,
        releaseId: `${binding.runId}:release`, reason: 'complete', evidenceRef: receiptId } }));
    state.finished = { result, released, receiptDigest: digest(receipt) };
    runtime.allocator.store.raw.prepare('UPDATE mission_time_runtime SET body=? WHERE id=?').run(JSON.stringify(state), binding.runId);
    clocks.delete(binding.runId);
    return state.finished;
  } finally { runtime.allocator.close(); }
}

async function preemptLocked(binding) {
  await native.accountingAuthority(binding);
  const held = native.historical(binding);
  if (!held) return null;
  const regulator = held.regulator;
  const runtime = native.open(binding, regulator);
  try {
    await runtime.usage.ready;
    const row = runtime.allocator.store.raw.prepare('SELECT body FROM mission_time_runtime WHERE id=?').get(binding.runId);
    if (!row) return null;
    const state = JSON.parse(row.body);
    if (state.finished) return null;
    return await runtime.usage.apply(native.message(binding, { type: 'PREEMPT', accounting: true,
      sender: regulator, audience: binding.actor, payload: { allocationId: state.query.allocationId,
        allocationDigest: state.query.allocationDigest, reason: 'operator_stop' } }));
  } finally { runtime.allocator.close(); }
}

const beforeExecution = binding => withTransaction(binding.db, () => admitAndExpose(binding));
const finish = binding => withTransaction(binding.db, () => finishLocked(binding));
const preempt = binding => withTransaction(binding.db, () => preemptLocked(binding));

module.exports = { prepare, beforeExecution, finish, preempt };
