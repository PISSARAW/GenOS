'use strict';

const DEFAULT_SNAPSHOT_INTERVAL = 100;
const CYCLE_STAGES = Object.freeze([
  'RECEIVE_OPERATIONS', 'AUTHORITY_CHECK', 'CAUSAL_CLASSIFICATION', 'SEMANTIC_MERGE_ANALYSIS',
  'DETERMINE_CONSISTENCY_ZONE', 'INVARIANT_CONFLUENCE_CHECK', 'COMMIT_COORDINATE_OR_REJECT',
  'MATERIALIZE_STATE', 'PUBLISH_SELECTIVE_DELTAS', 'CHECK_INVARIANTS', 'REPAIR_IF_REQUESTED',
  'SNAPSHOT_OR_COMPACT', 'NEXT_OPERATIONS'
]);

function createSyncytiumTick(context) {
  return { processEvent: (sessionId, event) => processEvent({ sessionId, event, ...context }) };
}

async function processEvent(context) {
  const { sessionId, event, syncytium, stateController, repairController, materializationController } = context;
  validateIntervals(event, context.options);
  const before = await syncytium.snapshot(sessionId, event?.options || {});
  const result = await stateController.receive(sessionId, event);
  const after = await syncytium.snapshot(sessionId, event?.options || {});
  const repair = await repairController.inspect(sessionId, event?.options || {});
  const repairResult = event?.repairRequest && repair.required
    ? await repairController.repair(sessionId, event.repairRequest) : null;
  const materialization = await materializeIfDue({
    sessionId, event, beforeVersion: before.shared.totalOps,
    afterVersion: after.shared.totalOps, materializationController, options: context.options
  });
  return {
    sessionId, result, snapshot: after, repair, repairResult, materialization,
    cycle: CYCLE_STAGES, eventDriven: true
  };
}

async function materializeIfDue(context) {
  const interval = context.event?.snapshotEvery ?? context.options.snapshotEvery ?? DEFAULT_SNAPSHOT_INTERVAL;
  const compactEvery = context.event?.compactEvery ?? context.options.compactEvery ?? 0;
  const snapshotDue = crossedBoundary(context.beforeVersion, context.afterVersion, interval);
  const compactDue = crossedBoundary(context.beforeVersion, context.afterVersion, compactEvery);
  if (!snapshotDue && !compactDue) return null;
  const stored = await context.materializationController.materialize(context.sessionId, context.event?.options || {});
  const compacted = compactDue
    ? await context.materializationController.compact(context.sessionId, context.event?.options || {}) : null;
  return { snapshot: stored.stored, stateVersion: stored.stateVersion, compaction: compacted, snapshotDue };
}

function validateIntervals(event, options = {}) {
  const intervals = [
    event?.snapshotEvery ?? options.snapshotEvery ?? DEFAULT_SNAPSHOT_INTERVAL,
    event?.compactEvery ?? options.compactEvery ?? 0
  ];
  if (intervals.some((interval) => !Number.isSafeInteger(interval) || interval < 0)) {
    throw Object.assign(new Error('Runtime snapshot and compaction intervals must be non-negative integers.'), {
      code: 'SYNCYTIUM_RUNTIME_INTERVAL_INVALID'
    });
  }
}

function crossedBoundary(before, after, interval) {
  return interval > 0 && Math.floor(before / interval) < Math.floor(after / interval);
}

module.exports = { CYCLE_STAGES, DEFAULT_SNAPSHOT_INTERVAL, createSyncytiumTick };
