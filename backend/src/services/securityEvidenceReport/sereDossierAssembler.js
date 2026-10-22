'use strict';

const {
  DOSSIER_SCHEMA,
  AUTHORITY_MODEL,
  failure,
  text,
  fingerprint
} = require('./serePrimitives');
const {
  normalizeMandate,
  normalizeObservations,
  normalizeChronology,
  normalizeHypotheses
} = require('./sereSections');
const {
  normalizeActions,
  normalizeBeforeAfter,
  normalizeVisibilityLimitations,
  normalizeDecisions
} = require('./sereOperationalSections');
const { adjudicateCampaign } = require('../securityRemediation/campaignAdjudicator');

function assembleSereDossier(input) {
  if (!input || typeof input !== 'object') throw failure('SERE_INPUT_REQUIRED');
  const reportId = text(input.reportId || input.id, 'SERE_REPORT_ID_REQUIRED', 128);
  const mandate = normalizeMandate(input.mandate);
  const observations = normalizeObservations(input.observations, mandate);
  const chronology = normalizeChronology(input.chronology);
  const hypotheses = normalizeHypotheses(input.hypotheses);
  const actions = normalizeActions(input.actions, mandate);
  const beforeAfter = normalizeBeforeAfter(input.beforeAfter);
  const visibilityLimitations = normalizeVisibilityLimitations(input.visibilityLimitations);
  const decisions = normalizeDecisions(input.decisions);
  const sectionHashes = {
    mandate: mandate.mandateHash,
    observations: observations.sectionHash,
    chronology: chronology.sectionHash,
    hypotheses: hypotheses.sectionHash,
    actions: actions.sectionHash,
    beforeAfter: beforeAfter.sectionHash,
    visibilityLimitations: visibilityLimitations.sectionHash,
    decisions: decisions.sectionHash
  };
  const body = {
    schema: DOSSIER_SCHEMA,
    reportId,
    mandate,
    observations,
    chronology,
    hypotheses,
    actions,
    beforeAfter,
    visibilityLimitations,
    decisions,
    sectionHashes,
    authorityModel: AUTHORITY_MODEL,
    promotionEligible: false,
    authorizesPromotion: false,
    requiresExistingPromotionGate: true
  };
  return { ...body, dossierHash: fingerprint(body) };
}

function mapCampaignConfirmations(outcome, supporting, receiptObsByHash) {
  return supporting.map((rec, idx) => ({
    id: `conf-${outcome.candidateId}-${idx + 1}`,
    observationId: receiptObsByHash.get(rec.receiptHash),
    verifierId: rec.verifierId,
    independent: true,
    rationale: `Scanner=${rec.checks.scannerOutcome}, reproduction=${rec.checks.safePathReproduction}`,
    evidenceHash: rec.receiptHash
  }));
}

function mapCampaignRefutations(outcome, refuting, receiptObsByHash) {
  return refuting.map((rec, idx) => ({
    id: `ref-${outcome.candidateId}-${idx + 1}`,
    observationId: receiptObsByHash.get(rec.receiptHash),
    verifierId: rec.verifierId,
    independent: true,
    counterexample: `Verification refuted candidate ${outcome.candidateId}: ${outcome.reasons.join(', ')}`,
    evidenceHash: rec.receiptHash
  }));
}

function resolveCampaignHypothesisStatus(outcome, hasRefutations) {
  if (hasRefutations) return 'refuted';
  if (outcome.disposition === 'qualified' || outcome.disposition === 'baseline') return 'confirmed';
  return 'unknown';
}

function buildCampaignHypothesisEntry(outcome, receiptObsByHash, unknowns) {
  const list = outcome.receipts ?? [];
  const supporting = list.filter((item) => item.status === 'verified');
  const refuting = list.filter((item) => item.status === 'refuted');
  const status = resolveCampaignHypothesisStatus(outcome, refuting.length > 0);
  const confirmations = refuting.length > 0
    ? []
    : mapCampaignConfirmations(outcome, supporting, receiptObsByHash);
  return {
    id: `hyp-${outcome.candidateId}`,
    statement: `Candidate ${outcome.candidateId} (${outcome.family}) satisfies safety & remediation checks for ${outcome.clusterId}`,
    proposedBy: 'campaign-planner',
    status,
    confirmations,
    refutations: mapCampaignRefutations(outcome, refuting, receiptObsByHash),
    unknowns: outcome.candidateId === unknowns.firstCandidateId ? unknowns.items : []
  };
}

function buildCampaignHypotheses(input) {
  const observations = input.reportEvidence.observations;
  const receiptObsByHash = new Map(observations.map((obs) => [obs.artifactHash, obs.id]));
  const unknowns = {
    firstCandidateId: input.adjudication.outcomes?.[0]?.candidateId,
    items: input.reportEvidence.unknowns
  };
  const hypotheses = (input.adjudication?.outcomes || []).map(
    (outcome) => buildCampaignHypothesisEntry(outcome, receiptObsByHash, unknowns)
  );
  return { observations, hypotheses };
}

function buildCampaignOperationalInput(input) {
  const evidence = input.reportEvidence;
  return {
    chronology: evidence.chronology,
    actions: evidence.actions,
    beforeAfter: evidence.beforeAfter,
    visibilityLimitations: evidence.visibilityLimitations,
    decisions: evidence.decisions
  };
}

function verifyCampaignArtifacts(input) {
  const body = { ...input.campaign };
  delete body.campaignHash;
  if (input.campaign.campaignHash !== fingerprint(body)) {
    throw failure('SERE_CAMPAIGN_HASH_INVALID');
  }
  const rebuilt = adjudicateCampaign(input.campaign, input.receipts);
  const suppliedAdjudication = { ...input.adjudication };
  delete suppliedAdjudication.adjudicationHash;
  if (rebuilt.adjudicationHash !== input.adjudication.adjudicationHash
      || fingerprint(suppliedAdjudication) !== rebuilt.adjudicationHash
      || input.adjudication.campaignHash !== input.campaign.campaignHash) {
    throw failure('SERE_CAMPAIGN_ADJUDICATION_MISMATCH');
  }
}

function assertCampaignInput(input) {
  if (!input?.mandate || !input?.campaign || !input?.adjudication || !Array.isArray(input.receipts)) {
    throw failure('SERE_CAMPAIGN_ARTIFACTS_REQUIRED');
  }
}

function assertCampaignReportEvidence(evidence) {
  const requiredLists = ['observations', 'chronology', 'unknowns', 'beforeAfter', 'visibilityLimitations', 'decisions'];
  if (!evidence || requiredLists.some((key) => !Array.isArray(evidence[key]) || !evidence[key].length)
      || !evidence.actions || !Array.isArray(evidence.actions.authorized)
      || !Array.isArray(evidence.actions.executed)) {
    throw failure('SERE_CAMPAIGN_REPORT_EVIDENCE_REQUIRED');
  }
}

function fromRemediationCampaign(input) {
  assertCampaignInput(input);
  verifyCampaignArtifacts(input);
  assertCampaignReportEvidence(input.reportEvidence);
  const built = buildCampaignHypotheses(input);
  const operational = buildCampaignOperationalInput(input);
  return assembleSereDossier({
    reportId: input.reportId || `sere-${input.adjudication.adjudicationHash.slice(0, 12)}`,
    mandate: input.mandate,
    observations: built.observations,
    chronology: operational.chronology,
    hypotheses: { items: built.hypotheses },
    actions: operational.actions,
    beforeAfter: operational.beforeAfter,
    visibilityLimitations: operational.visibilityLimitations,
    decisions: operational.decisions
  });
}

module.exports = {
  assembleSereDossier,
  fromRemediationCampaign
};
