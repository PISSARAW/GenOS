'use strict';

const RELATED_FIELDS = new Set(['evidence', 'refutations', 'uncertainty']);

function detect(context) {
  const operation = context.operation;
  if (!RELATED_FIELDS.has(operation.kind?.key) || operation.kind?.action !== 'add') return [];
  const value = operation.kind.value;
  const claims = materializeClaims(context.history);
  if (!value?.claimId || !claims.has(value.claimId)) {
    return [{ type: 'EPISTEMIC_CLAIM_REFERENCE_MISSING', claimId: value?.claimId || null }];
  }
  return [];
}

function materializeClaims(history) {
  const claims = new Set();
  for (const operation of history) {
    if (operation.kind?.key !== 'claims' || operation.kind.action !== 'add') continue;
    const claimId = operation.kind.value?.claimId;
    if (claimId) claims.add(claimId);
  }
  return claims;
}

module.exports = { detect };
