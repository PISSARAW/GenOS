'use strict';

function failed(detail, step, failure) {
  const reason = failure.code || failure.message;
  return { status: 'error', reason, counterexamples: [],
    observations: [{ step, result: 'error', timestamp: new Date().toISOString(),
      detail: { ...detail, outcome: 'error', guardFailure: reason } }] };
}

module.exports = { failed };
