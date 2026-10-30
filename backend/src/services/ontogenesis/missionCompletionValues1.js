'use strict';

function validPassingReportValue1(__genosValueScope1) {
  return __genosValueScope1.artifact?.type === 'dossier' && __genosValueScope1.Array.isArray(__genosValueScope1.artifact.content?.claims)
    && __genosValueScope1.artifact.content.claims.length > 0 && typeof __genosValueScope1.provenance?.source === 'string'
    && __genosValueScope1.provenance.source.length > 0 && typeof __genosValueScope1.provenance.workspaceRoot === 'string'
    && __genosValueScope1.Array.isArray(__genosValueScope1.provenance.sourceRefs) && __genosValueScope1.provenance.sourceRefs.length > 0
    && __genosValueScope1.Array.isArray(__genosValueScope1.report.scopeCompletion?.completedRefs);
}

function completionGateValue2(__genosValueScope2) {
  return !__genosValueScope2.root || __genosValueScope2.root.status === 'completed'
    || (__genosValueScope2.root.status === 'unverified' && __genosValueScope2.root.missionCompletionEvidenceVerified === true);
}

function completionGateValue3(__genosValueScope3) {
  return __genosValueScope3.context.completionContract?.invariants?.length
        || __genosValueScope3.context.completionContract?.requiredEvidence?.length
        || __genosValueScope3.request.verifierChecks?.length;
}

function validPassingReportValue4(__genosValueScope4) {
  return !__genosValueScope4.Array.isArray(__genosValueScope4.report.tests) || __genosValueScope4.report.tests.length === 0
      || __genosValueScope4.report.tests.some((test) => !test || typeof test !== 'object'
        || !__genosValueScope4.Number.isInteger(test.exitCode) || test.exitCode !== 0 || test.signal);
}

module.exports = { validPassingReportValue1, completionGateValue2, completionGateValue3, validPassingReportValue4 };
