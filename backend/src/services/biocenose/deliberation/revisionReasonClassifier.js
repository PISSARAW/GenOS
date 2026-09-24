'use strict';

function classify(update) {
  const evidence = new Set(update.evidenceRefs);
  return {
    evidenceGrounded: update.reasonCodes.some((code) => isEvidenceReason(code)) && evidence.size > 0,
    socialSignalOnly: update.reasonCodes.every((code) => ['MAJORITY_SIGNAL', 'AUTHORITY_SIGNAL'].includes(code)) && evidence.size === 0
  };
}

function isEvidenceReason(code) {
  return ['NEW_EVIDENCE', 'COUNTEREXAMPLE', 'FORMAL_REFUTATION'].includes(code);
}

module.exports = { classify };
