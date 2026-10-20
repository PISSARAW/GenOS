'use strict';

const store = require('../holobiontStore');
const sanctions = require('../governance/sanctionService');

const BOUNDED_ACTIONS = new Set(['WARN', 'THROTTLE', 'REDUCE_RESOURCES', 'QUARANTINE']);

const GOVERNANCE_STATUS = 'heuristic';

function governanceResult(report, details = {}) {
  return {
    ...report,
    ...details,
    governanceStatus: GOVERNANCE_STATUS,
    promotionEligible: false,
    promotionReason: 'HEALTH_SIGNALS_ARE_ADVISORY_ONLY'
  };
}

async function applyHealthAction(db, input, report) {
  if (input.healthPolicy?.automatic === false || !report.failure?.classified) {
    return governanceResult(report, { automaticActionApplied: false, approvalRequired: true });
  }
  const action = report.nextAction;
  if (!BOUNDED_ACTIONS.has(action)) {
    return governanceResult(report, { automaticActionApplied: false, approvalRequired: true });
  }
  const session = await store.getSession(db, input.holobiontId);
  const actionResult = await sanctions.sanctionSymbiont(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    symbiontId: input.symbiontId, action, ratio: input.healthPolicy?.ratio ?? 0.5,
    reason: `Heuristic ${report.failure.failureClass} during capability execution`,
    evidenceRefs: report.failure.evidenceRefs, verifierId: input.verifierId || report.verifierId,
    duration: 'UNTIL_VERIFIED_HEALTH_REVIEW',
    recoveryConditions: ['Independent healthy trial under the active contract'],
    actorId: input.actorId, riskScore: 0, selfVerified: false
  });
  return governanceResult(report, {
    automaticActionApplied: actionResult.applied === true,
    approvalRequired: actionResult.applied !== true,
    actionResult
  });
}

module.exports = { BOUNDED_ACTIONS, applyHealthAction };
