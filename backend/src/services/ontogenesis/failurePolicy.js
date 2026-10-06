'use strict';

const { MAX_ATTEMPTS } = require('./taskSelector');

async function failureState(db, run, error) {
  if (!run || error.retryable !== true) return 'WAITING_INPUT';
  const task = await db.get('SELECT attempt FROM ontogenesis_backlog WHERE id = ?', [run.task_id]);
  return task && task.attempt < MAX_ATTEMPTS ? 'PLANNING' : 'WAITING_INPUT';
}

function workerFailure(result) {
  const error = new Error(result.error || 'mission-non-verifiee');
  error.retryable = true;
  return error;
}

module.exports = { failureState, workerFailure };
