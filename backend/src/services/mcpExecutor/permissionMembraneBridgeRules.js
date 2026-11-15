'use strict';

function executionLease(context) {
  return context.normalized === 'genos_replay' && context.binding?.status === 'authorized'
    && context.sealed.includes('genos_replay') && context.scopedWorkerReplayLeaseOpen()
    && context.directToolGloballyEnabled('genos_replay');
}

module.exports = { executionLease };
