'use strict';

function isComplete(evidence) {
  return evidence && Array.isArray(evidence.transitions) && evidence.transitions.length >= 2;
}

function transitionIsSafe(transition) {
  return transition.journaled === true && transition.identityPreserved === true
    && transition.validRelationsPreserved === true && transition.permissionsPreserved === true
    && transition.provenancePreserved === true && transition.collaborationReceipt === true;
}

function evaluateMorphogenesis(evidence) {
  if (!isComplete(evidence)) return { status: 'inconclusive', reasons: ['two transition records are required'] };
  const checks = evidence.transitions.map((transition) => ({
    transitionId: transition.id,
    safe: transitionIsSafe(transition)
  }));
  const violations = Number(evidence.criticalViolations || 0);
  const passed = checks.every((check) => check.safe) && violations === 0;
  return { status: passed ? 'pass' : 'fail', checks, criticalViolations: violations };
}

module.exports = { evaluateMorphogenesis };
