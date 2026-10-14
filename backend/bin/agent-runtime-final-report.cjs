const { compile } = require('../src/services/deterministicFinalReportService');

function compileCanonicalFinalReport(context) {
  try {
    return compile(context.autonomyPlan);
  } catch (error) {
    const missingDossiers = error.code === 'CANONICAL_DOSSIER_MISSING';
    context.emit({
      eventType: 'HARD_INVARIANT_FAILURE',
      action: 'CANONICAL_FINAL_REPORT',
      detail: missingDossiers
        ? 'Canonical synthesis requires every expected worker dossier exactly once.'
        : 'Canonical final report could not be compiled.',
      severity: 'error',
      status: 'error',
      payload: { code: error.code || 'CANONICAL_REPORT_INVALID' }
    });
    return false;
  }
}

module.exports = { compileCanonicalFinalReport };
