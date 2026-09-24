'use strict';

function evaluate(input) {
  const dissent = input.dissent;
  const critical = dissent && ['OPEN', 'ESCALATED', 'VALIDATED'].includes(dissent.status)
    && Number(dissent.dissent.severity) >= 0.8 && Number(dissent.dissent.materiality) >= 0.8;
  if (!critical) return { promotion: 'ALLOWED', blockingDissentIds: [], reason: 'No critical dissent.' };
  const receipts = input.receipts || [];
  const verified = receipts.filter((receipt) => trusted(receipt, dissent, input.isTrustedReceipt));
  if (!verified.length) return {
    promotion: 'REVIEW_REQUIRED', blockingDissentIds: [], reason: 'Critical minority evidence needs a trusted verification receipt.'
  };
  return {
    promotion: 'PROMOTION_BLOCKED', blockingDissentIds: [dissent.dissentId],
    receiptIds: verified.map((receipt) => receipt.receiptId), reason: 'Trusted fatal minority evidence is unresolved.'
  };
}

function trusted(receipt, dissent, isTrustedReceipt) {
  if (typeof isTrustedReceipt !== 'function' || !isTrustedReceipt(receipt)) return false;
  const relevant = dissent.dissent.evidenceRefs.includes(receipt.evidenceRef);
  const fatal = ['FATAL_COUNTEREXAMPLE', 'FORMAL_CONTRADICTION', 'REPRODUCIBLE_FAILURE'].includes(receipt.outcome);
  return relevant && fatal && receipt.status === 'VERIFIED';
}

module.exports = { evaluate };
