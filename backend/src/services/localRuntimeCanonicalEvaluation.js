'use strict';

function prepare(state, reply) {
  const synthesis = require('./localRuntimeSynthesis');
  const report = synthesis.parseReply(reply);
  if (report.schema !== 'genos.canonical-final-report/v1') return null;
  const expected = synthesis.canonicalReply(state.autonomyPlan);
  if (!expected || JSON.stringify(report) !== expected) {
    throw Object.assign(new Error('Canonical report differs from its bound source dossiers.'),
      {code: 'CANONICAL_REPORT_BINDING_MISMATCH'});
  }
  synthesis.validateSynthesisReply(reply, state.autonomyPlan);
  return {status: 'structure_validated', workerIds: [...state.autonomyPlan.completedWorkerIds],
    nativeVerification: 'required_in_trusted_parent', promotion: 'not_requested'};
}

module.exports = {prepare};
