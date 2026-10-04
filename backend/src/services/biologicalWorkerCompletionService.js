'use strict';

const semanticValidation = require('./biologicalSemanticValidationService');

async function validateSyncytiumResponses({ db, context, accepted, expectedCount, waitForWorkers }) {
  const settled = await waitForWorkers(db, accepted, context.request.timeoutMs);
  await collectCompletedWorkerStatuses({ db, context, accepted });
  if (!settled) recordDispatchFailure(context, 'orchestrator', 'worker_wait_timeout');
  const validation = await semanticValidation.validate(db, accepted);
  validation.expectedWorkers = expectedCount;
  validation.dispatchedWorkers = accepted.length;
  return validation;
}

async function collectCompletedWorkerStatuses({ db, context, accepted }) {
  const statuses = await Promise.all(accepted.map(async (member) => ({
    member, row: await db.get('SELECT status FROM agents WHERE id = ?', member.workerId)
  })));
  for (const { member, row } of statuses) {
    member.status = row?.status || 'missing';
    if (member.status !== 'completed') recordDispatchFailure(context, member.role, `worker_status_${member.status}`);
  }
}

function recordDispatchFailure(context, role, reason) {
  context.dispatchFailures ||= [];
  context.dispatchFailures.push({ role, reason });
}

module.exports = { validateSyncytiumResponses, collectCompletedWorkerStatuses, recordDispatchFailure };
