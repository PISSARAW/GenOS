'use strict';

const { objectValue, textValue, enumValue, listValue } = require('./validation');

function normalizeRouteOutcome(value) {
  const outcome = objectValue(value, 'RouteOutcome');
  const verification = objectValue(outcome.verification, 'verification');
  const signedReceipt = objectValue(verification.signedReceipt, 'verification.signedReceipt');
  const evidenceRefs = listValue(verification.evidenceRefs, 'verification.evidenceRefs');
  if (verification.status !== 'VERIFIED' || !evidenceRefs.length) {
    throw Object.assign(new Error('Verified route outcome requires evidence references.'), { code: 'RHIZOME_ROUTE_EVIDENCE_REQUIRED' });
  }
  return {
    routeId: textValue(outcome.routeId, 'routeId'),
    needId: textValue(outcome.needId, 'needId'),
    capability: textValue(outcome.capability, 'capability'),
    nodeIds: listValue(outcome.nodeIds, 'nodeIds'),
    edgeIds: listValue(outcome.edgeIds, 'edgeIds'),
    outcome: enumValue(outcome.outcome, { allowed: ['SUCCESS', 'FAILURE'], field: 'outcome' }),
    verification: {
      verificationId: textValue(verification.verificationId, 'verification.verificationId'),
      verifierId: textValue(verification.verifierId, 'verification.verifierId'),
      status: 'VERIFIED',
      result: enumValue(verification.result, { allowed: ['SUCCESS', 'FAILURE'], field: 'verification.result' }),
      evidenceRefs,
      signedReceipt
    }
  };
}

module.exports = { normalizeRouteOutcome };
