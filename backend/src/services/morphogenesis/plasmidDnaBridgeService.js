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
  const uses = record.assimilationCount || 0;
  if (uses === 0) return 0;
  return (record.successCount || 0) / uses;
}

function isGermlineCandidate(record) {
  if (!record || record.expressionStatus === 'revoked') return false;
  if ((record.assimilationCount || 0) < GERMLINE_MIN_USES) return false;
  if (successRateOf(record) < GERMLINE_MIN_SUCCESS_RATE) return false;
  if (record.regressions > 0) return false;
  return asList(record.evidence).length > 0;
}

function asList(value) {
  return Array.isArray(value) ? value : [];
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
    evidence: { source: 'repeated_plasmid_success', uses: record.assimilationCount, rate: successRateOf(record) }
  });
  return { proposed: true, candidate, kind: 'GERMLINE_ASSIMILATION_CANDIDATE' };
}

module.exports = { proposeGermlineAssimilation, isGermlineCandidate, GERMLINE_MIN_USES };
