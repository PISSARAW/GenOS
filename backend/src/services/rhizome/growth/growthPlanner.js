'use strict';

const evidenceService = require('../boundary/gapEvidenceService');
const budgetService = require('./growthBudgetService');
const valueService = require('./growthValueService');
const candidateService = require('./growthCandidateService');
const policy = require('./minimalGrowthPolicy');
const meristem = require('../../morphogenesis/capabilities/epistemicMeristem');

function validEvidence(session, gap) {
  return evidenceService.hasGapEvidence(gap)
    && gap.needId === gap.evidence.needId && gap.evidence.graphVersion === session.graphVersion;
}

function eligibleCandidates(context) {
  const { session, gap, candidates, threshold } = context;
  return candidates.filter((candidate) => candidate.sufficient && budgetService.fitsBudget(session, candidate)
    && candidate.evidenceRefs.includes(gap.evidence.evidenceId)
    && valueService.score(candidate, gap) > threshold);
}

function chooseExperimentalCandidate(candidates, receipts) {
  const experimental = candidates.filter((candidate) => candidate.experimentContract);
  if (!experimental.length) return policy.choose(candidates);
  const ranked = meristem.rankExperiments({
    candidates: experimental.map((candidate) => candidate.experimentContract),
    coverageReceipts: receipts
  });
  return candidates.find((candidate) => candidate.experimentContract?.experimentId === ranked[0]?.experiment.experimentId)
    || policy.choose(candidates);
}

function plan(input) {
  const { session, gap, values, options = {} } = input;
  if (!validEvidence(session, gap)) {
    return { permitted: false, reason: 'GAP_EVIDENCE_REQUIRED', candidate: null };
  }
  const threshold = Number.isFinite(options.threshold) ? options.threshold : 0;
  const candidates = candidateService.normalizeCandidates(values);
  const eligible = eligibleCandidates({ session, gap, candidates, threshold });
  const selected = options.experimentalCoverageReceipts
    ? chooseExperimentalCandidate(eligible, options.experimentalCoverageReceipts) : policy.choose(eligible);
  if (!selected) return { permitted: false, reason: 'NO_VIABLE_GROWTH', candidate: null };
  return {
    permitted: true,
    reason: 'MINIMAL_SUFFICIENT_CANDIDATE',
    candidate: selected,
    value: valueService.score(selected, gap),
    graphVersion: session.graphVersion,
    experimentalDistinction: selected.experimentContract || null
  };
}

module.exports = { plan };
