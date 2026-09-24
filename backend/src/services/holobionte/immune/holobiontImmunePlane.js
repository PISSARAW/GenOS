'use strict';

const { immuneSymbiontReview } = require('../../epistemic/epistemicHolobionteService');

function summary(report) {
  return {
    allowed: report.blocked !== true,
    blocked: report.blocked === true,
    decision: report.decision,
    blockReason: report.blockReason || null,
    regulatorInhibited: report.regulatorInhibited === true,
    verifierStatuses: (report.verifierResults?.results || []).map((item) => item.status)
  };
}

function antigenFor(input) {
  const refs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [];
  return {
    claim: String(input.claim || `Holobiont symbiont ${input.symbiontId} result review`),
    risk: { score: Number(input.riskScore) || 0 },
    epitopes: {
      evidence: { kind: 'proof', digest: input.resultHash || refs.join('|') || 'missing-evidence' },
      assumptions: [],
      validityDomain: { domain: 'holobionte' },
      provenance: { verifierId: input.verifierId || null, selfVerified: input.selfVerified === true }
    }
  };
}

async function reviewSymbiontOutput(input = {}) {
  const report = await immuneSymbiontReview(antigenFor(input), {
    domain: 'holobionte', stakes: 'high', immuneMemory: input.immuneMemory || []
  });
  return summary(report);
}

module.exports = { reviewSymbiontOutput };
