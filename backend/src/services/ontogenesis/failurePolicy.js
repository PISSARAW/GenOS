'use strict';

const { MAX_ATTEMPTS } = require('./taskSelector');

async function failureState(db, run, error, maxAttempts = MAX_ATTEMPTS) {
  if (!run || error.retryable !== true) return 'WAITING_INPUT';
  const task = await db.get('SELECT attempt FROM ontogenesis_backlog WHERE id = ?', [run.task_id]);
  const limit = require('./taskSelector').normalizedMaxAttempts(maxAttempts);
  return task && task.attempt < limit ? 'PLANNING' : 'WAITING_INPUT';
}

function workerFailure(result) {
  const error = new Error(result.error || 'mission-non-verifiee');
  error.retryable = true;
  return error;
}

module.exports = { failureState, workerFailure };
