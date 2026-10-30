'use strict';

const deadline = require('./recoveryDeadline');
const queue = require('./durableRecoveryQueue');

async function skipValidatedOrExpired(recovery, source) {
  if (source.status !== 'completed') return deadline.exhaustExpired(recovery, source);
  await queue.finish(recovery.durableItem, 'dispatched');
  require('../agentOrchestrationState').emit(source.parent_agent_id,
    'WORKER_RECOVERY_REDUNDANT', 'RECOVERY_SKIPPED',
    `Recovery skipped: source worker '${source.id}' already completed with validated work; no replacement will be promoted.`,
    { sourceWorkerId: source.id, workerId: source.id, terminal: true }, 'info');
  return true;
}

async function beforeLaunch(input) {
  if (input.barrier?.cancelled || !await queue.isClaimActive(input.durableItem)) return 'cancelled';
  return deadline.expired(input.mission) ? 'exhausted' : null;
}

module.exports = { skipValidatedOrExpired, beforeLaunch };
