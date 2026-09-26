'use strict';

function createMigrationValidator(opts = {}) {
  const { minClaimRetention = 0.7, minEvidenceRetention = 0.8, maxLossEstimate = 0.3 } = opts;
  return { validateExport: makeExportValidator(), validateImport: makeImportValidator(maxLossEstimate, minClaimRetention), validateRoundTrip: makeRoundTripValidator(minClaimRetention, minEvidenceRetention), checkSemanticPreservation: makeSemanticValidator(maxLossEstimate) };
}

function makeExportValidator() {
  return function(bundle) { const w = []; if (!bundle.claims?.length) w.push('No claims'); if (!bundle.evidence?.length) w.push('No evidence'); if (bundle.uncertainties?.length > bundle.claims?.length) w.push('High uncertainty'); return { valid: true, errors: [], warnings: w }; };
}

function makeImportValidator(maxLoss, minClaim) {
  return function(bundle, adapter) { const w = []; if ((adapter?.lossEstimate || 0) > maxLoss) w.push(`Loss > ${maxLoss}`); const r = bundle.claims?.length > 0 ? 1 : 0; if (r < minClaim) return { valid: false, errors: [`Retention ${r} < ${minClaim}`], warnings: w, claimRetention: r }; return { valid: true, errors: [], warnings: w, claimRetention: r }; };
}

function makeRoundTripValidator(minClaim, minEvidence) {
  return function(orig, imported) {
    const oc = new Set(orig.claims?.map(c => c.statement) || []);
    const ic = new Set(imported.claims?.map(c => c.statement) || []);
    const ret = [...oc].filter(c => ic.has(c)).length;
    const retention = oc.size ? ret / oc.size : 1;
    const evRet = orig.evidence?.length ? (imported.evidence?.length || 0) / orig.evidence.length : 1;
    const w = []; if (retention < minClaim) w.push(`Claim retention ${retention.toFixed(2)} < ${minClaim}`); if (evRet < minEvidence) w.push(`Evidence retention ${evRet.toFixed(2)} < ${minEvidence}`);
    return { valid: retention >= minClaim && evRet >= minEvidence, claimRetention: retention, evidenceRetention: evRet, warnings: w };
  };
}

function makeSemanticValidator(maxLoss) {
  return function(source, target, adapter) {
    const checks = { claimsMapped: checkClaims(source, target), evidenceMapped: checkEvidence(source, target), constraintsMapped: checkConstraints(source, target), lossWithinBudget: (adapter?.lossEstimate || 0) <= maxLoss };
    return { passed: Object.values(checks).every(v => v), details: checks };
  };
}

function checkClaims(s, t) { if (!s?.claims || !t?.hypotheses) return true; const sc = s.claims.map(c => c.statement); const th = t.hypotheses.map(h => h.statement); return sc.every(c => th.some(h => h.includes(c) || c.includes(h))); }
function checkEvidence(s, t) { if (!s?.evidence || !t?.evidence) return true; return s.evidence.length <= (t.evidence.length || 0) * 1.5; }
function checkConstraints(s, t) { if (!s?.constraints || !t?.constraints) return true; return s.constraints.every(c => t.constraints.includes(c)); }

module.exports = { createMigrationValidator };