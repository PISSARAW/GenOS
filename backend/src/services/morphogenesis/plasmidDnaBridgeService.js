'use strict';

/**
 * PlasmidDnaBridge — X10 : useful plasmid -> AgentDNA candidate.
 *
 * Si un plasmide est utilisé N fois avec fort taux de succès, sans
 * régression et avec preuves solides, GenOS propose un candidat
 * GERMLINE_ASSIMILATION via agentDnaInnovation. Jamais de promotion
 * automatique : evaluateCandidate() puis promoteCandidate() restent
 * obligatoires. Plasmide != permission (lease runtime requis).
 */

const GERMLINE_MIN_USES = 30;
const GERMLINE_MIN_SUCCESS_RATE = 0.8;

function successRateOf(record) {
  const attempts = Number.isInteger(record.attemptCount) ? record.attemptCount : 0;
  if (attempts <= 0) return 0;
  return record.successCount / attempts;
}

function isGermlineCandidate(record) {
  if (!record || record.expressionStatus === 'revoked') return false;
  if (!Number.isInteger(record.attemptCount) || record.attemptCount < GERMLINE_MIN_USES) return false;
  if (!Number.isInteger(record.successCount) || record.successCount < 0 || record.successCount > record.attemptCount) return false;
  if (successRateOf(record) < GERMLINE_MIN_SUCCESS_RATE) return false;
  if (record.regressions > 0) return false;
  return hasVerifiedEvidence(record.evidence);
}

function hasVerifiedEvidence(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => item && item.verified === true
    && typeof item.id === 'string' && item.id.trim()
    && typeof item.hash === 'string' && /^[a-f0-9]{64}$/i.test(item.hash));
}

async function proposeGermlineAssimilation(input) {
  const record = input.record;
  if (!isGermlineCandidate(record)) return { proposed: false, reason: 'insufficient_repeated_proof' };
  const innovation = require('../agentDnaInnovation');
  const candidate = await innovation.captureCandidate(input.db, {
    baseGenomeRef: input.baseGenomeRef,
    name: `germline_${record.capability}`,
    concept: record.capability,
    concepts: [{ locus: `PLASMID_${record.capability}`, instruction: record.capability }],
    evidence: { source: 'repeated_plasmid_success', uses: record.attemptCount, rate: successRateOf(record) }
  });
  return { proposed: true, candidate, kind: 'GERMLINE_ASSIMILATION_CANDIDATE' };
}

module.exports = { proposeGermlineAssimilation, isGermlineCandidate, GERMLINE_MIN_USES };
