'use strict';

function executeConfiguredTransport(context) {
  return context.normalizedToolName === 'genos_replay' && context.scopedReplayAllowed === true
    && !context.hasConfiguredEndpoint() && context.require('./config').scopedWorkerReplayLeaseOpen();
}

module.exports = { executeConfiguredTransport };
