'use strict';

function validPassingReportRule1(context) {
  return context.artifact?.type === 'dossier' && context.Array.isArray(context.artifact.content?.claims)
    && context.artifact.content.claims.length > 0 && typeof context.provenance?.source === 'string'
    && context.provenance.source.length > 0 && typeof context.provenance.workspaceRoot === 'string'
    && context.Array.isArray(context.provenance.sourceRefs) && context.provenance.sourceRefs.length > 0
    && context.Array.isArray(context.report.scopeCompletion?.completedRefs);
}

function completionGateRule2(context) {
  return !context.root || context.root.status === 'completed'
    || (context.root.status === 'unverified' && context.root.missionCompletionEvidenceVerified === true);
}

function completionGateRule3(context) {
  return context.context.completionContract?.invariants?.length
        || context.context.completionContract?.requiredEvidence?.length
        || context.request.verifierChecks?.length;
}

function validPassingReportRule4(context) {
  return !context.Array.isArray(context.report.tests) || context.report.tests.length === 0
      || context.report.tests.some((test) => !test || typeof test !== 'object'
        || !context.Number.isInteger(test.exitCode) || test.exitCode !== 0 || test.signal);
}

module.exports = { validPassingReportRule1, completionGateRule2, completionGateRule3, validPassingReportRule4 };
