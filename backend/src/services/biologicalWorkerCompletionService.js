'use strict';

const semanticValidation = require('./biologicalSemanticValidationService');

async function validateSyncytiumResponses({ db, context, accepted, expectedCount, waitForWorkers }) {
  const settled = await waitForWorkers(db, accepted, context.request.timeoutMs);
  await collectCompletedWorkerStatuses({ db, context, accepted });
  if (!settled) recordDispatchFailure(context, 'orchestrator', 'worker_wait_timeout');
  const validation = await semanticValidation.validate(db, { members: accepted, missionId: context.missionId });
  validation.expectedWorkers = expectedCount;
  validation.dispatchedWorkers = accepted.length;
  return validation;
}

async function collectCompletedWorkerStatuses({ db, context, accepted }) {
  const statuses = await Promise.all(accepted.map(async (member) => ({
    member, status: await dispatchedRunStatus(db, context, member)
  })));
  for (const { member, status } of statuses) {
    member.status = status;
    if (member.status !== 'completed') recordDispatchFailure(context, member.role, `worker_status_${member.status}`);
  }
}

async function dispatchedRunStatus(db, context, member) {
  if (!member.executionRunId) {
    const row = await db.get('SELECT status FROM agents WHERE id = ?', member.workerId);
    return row?.status || 'missing';
  }
  const result = await require('./topology/workerResultReader.cjs').read(db, {
    missionId: context.missionId, executionRunId: member.executionRunId, member
  });
  return result.status;
}

function recordDispatchFailure(context, role, reason) {
  context.dispatchFailures ||= [];
  context.dispatchFailures.push({ role, reason });
}

module.exports = { validateSyncytiumResponses, collectCompletedWorkerStatuses, recordDispatchFailure };
