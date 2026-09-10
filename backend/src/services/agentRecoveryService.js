/**
 * Worker failure recovery: failure reports, recovery decisions (retry, mutate,
 * fork, replace), and the dispatch of recovery missions.
 *
 * Implementation lives in the ./agentRecovery helpers; this module keeps the
 * public surface stable.
 */
const { MAX_RECOVERY_DISPATCH_ATTEMPTS } = require('./agentRecovery/constants');
const { applyOrganizationDecision } = require('./agentRecovery/organizationDecision');
const { queueWorkerRecovery } = require('./agentRecovery/queueWorkerRecovery');
const { dispatchWorkerRecovery } = require('./agentRecovery/dispatchWorkerRecovery');

module.exports = { MAX_RECOVERY_DISPATCH_ATTEMPTS, applyOrganizationDecision, queueWorkerRecovery, dispatchWorkerRecovery };
