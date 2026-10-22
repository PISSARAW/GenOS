'use strict';

const {
  DOSSIER_SCHEMA,
  AUTHORITY_MODEL,
  failure,
  text,
  computeDigest,
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

function campaignAlertObservations(batch, baseTimeMs) {
  return (batch?.alerts || []).map((alert, index) => ({
    id: `obs-alert-${index + 1}`,
    source: alert.source || 'scanner',
    producerId: `scanner:${alert.ruleId}`,
    verifierId: null,
    observedAt: new Date(baseTimeMs + index * 1000).toISOString(),
    target: alert.location.path,
    severity: alert.severity,
    summary: `[${alert.ruleId}] ${alert.message}`,
    artifactRef: `antigen://${alert.antigenHash}`,
    artifactHash: alert.antigenHash,
    metrics: { line: alert.location.line, cwes: alert.cwes }
  }));
}

function toReceiptObservation(receipt, index, ctx) {
  const candidate = ctx.candidates.get(receipt.candidateId) ?? {};
  const severity = receipt.status === 'verified' ? 'info' : 'warning';
  return {
    id: `obs-receipt-${index + 1}`,
    source: 'verifier_receipt',
    producerId: candidate.producerId ?? 'campaign-producer',
    verifierId: receipt.verifierId,
    observedAt: new Date(ctx.baseTimeMs + 60000 + index * 1000).toISOString(),
    target: candidate.target ?? 'workspace',
    severity,
    summary: `Verifier ${receipt.verifierId} evaluated ${receipt.candidateId} as ${receipt.status}`,
    artifactRef: receipt.evidenceRef,
    artifactHash: receipt.receiptHash,
    metrics: receipt.checks?.metrics ?? {}
  };
}

function campaignReceiptObservations(campaign, receipts, baseTimeMs) {
  const candidates = new Map((campaign?.candidates ?? []).map((item) => [item.id, item]));
  const ctx = { candidates, baseTimeMs };
  return (receipts ?? []).map((receipt, index) => toReceiptObservation(receipt, index, ctx));
}

function mapCampaignConfirmations(outcome, supporting, receiptObsByHash) {
  return supporting.map((rec, idx) => ({
    id: `conf-${outcome.candidateId}-${idx + 1}`,
    observationId: receiptObsByHash.get(rec.receiptHash) ?? 'obs-receipt-1',
    verifierId: rec.verifierId,
    independent: true,
    rationale: `Scanner=${rec.checks.scannerOutcome}, reproduction=${rec.checks.safePathReproduction}`,
    evidenceHash: rec.receiptHash
  }));
}

function mapCampaignRefutations(outcome, refuting, receiptObsByHash) {
  return refuting.map((rec, idx) => ({
    id: `ref-${outcome.candidateId}-${idx + 1}`,
    observationId: receiptObsByHash.get(rec.receiptHash) ?? 'obs-receipt-1',
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

function buildCampaignInputFromArtifacts(input) {
  const baseTimeMs = Date.parse(input.mandate?.issuedAt || '2026-10-22T12:00:00Z');
  const alertObs = campaignAlertObservations(input.batch, baseTimeMs);
  const targetDefault = alertObs[0]?.target || 'workspace';
  const enrichedCampaign = {
    ...input.campaign,
    candidates: (input.campaign?.candidates || []).map((item) => ({ ...item, target: item.target || targetDefault }))
  };
  const receiptObs = campaignReceiptObservations(enrichedCampaign, input.receipts, baseTimeMs);
  const observations = [...alertObs, ...receiptObs];
  const receiptObsByHash = new Map(receiptObs.map((obs) => [obs.artifactHash, obs.id]));
  const unknowns = {
    firstCandidateId: input.adjudication?.outcomes?.[0]?.candidateId,
    items: input.unknowns || [{
      id: 'unk-live-exploit',
      area: 'production-runtime',
      description: 'Live exploit payloads were not executed outside the isolated copy-on-write fixture.',
      impact: 'Production-specific WAF or hardware timing side-effects remain outside fixture scope.',
      mitigationRef: 'lim-isolated-fixture'
    }]
  };
  const hypotheses = (input.adjudication?.outcomes || []).map(
    (outcome) => buildCampaignHypothesisEntry(outcome, receiptObsByHash, unknowns)
  );
  return { baseTimeMs, targetDefault, enrichedCampaign, observations, hypotheses };
}

function buildCampaignOperationalInput(input, context) {
  const { baseTimeMs, targetDefault, enrichedCampaign, observations } = context;
  const authorized = enrichedCampaign.candidates.map((cand) => ({
    id: `auth-${cand.id}`,
    actionType: 'isolated_verification',
    target: cand.target,
    commandOrTool: `capsule:${cand.isolation?.workspaceId || cand.id}`,
    authorizedBy: input.mandate.issuer,
    leaseRef: `lease:${cand.id}`
  }));
  const executed = enrichedCampaign.candidates.map((cand, idx) => ({
    id: `exec-${cand.id}`,
    authorizedActionId: `auth-${cand.id}`,
    actionType: 'isolated_verification',
    target: cand.target,
    actorId: cand.producerId || 'campaign-runner',
    executedAt: new Date(baseTimeMs + 30000 + idx * 1000).toISOString(),
    status: cand.status === 'blocked_by_negative_memory' ? 'blocked' : 'succeeded',
    receiptRef: `campaign://${enrichedCampaign.campaignHash}/${cand.id}`,
    receiptHash: computeDigest(`${enrichedCampaign.campaignHash}:${cand.id}`)
  }));
  const rec = input.adjudication.recommendations[0];
  const control = input.adjudication.outcomes.find((item) => item.family === 'control');
  const beforeDigest = control?.receipts?.[0]?.receiptHash || computeDigest('control-baseline');
  const afterDigest = rec?.receipts?.[0]?.receiptHash || beforeDigest;
  const beforeAfter = [{
    id: 'diff-remediation-1',
    target: targetDefault,
    category: 'alerts',
    before: { snapshotId: 'snap-control', digest: beforeDigest, summary: 'Baseline control alert state', metrics: control?.receipts?.[0]?.checks?.metrics || {} },
    after: { snapshotId: `snap-${rec?.candidateId || 'after'}`, digest: afterDigest, summary: 'Post-remediation candidate state', metrics: rec?.metrics || {} },
    delta: { changed: beforeDigest !== afterDigest, summary: `Recommended candidate ${rec?.candidateId || 'none'} reduced remaining alerts`, added: ['parameterized_query_guard'], removed: ['raw_sql_concatenation'], metricDelta: rec?.metrics || {} },
    actionIds: [`exec-${rec?.candidateId || enrichedCampaign.candidates[0].id}`],
    verifierId: rec?.receipts?.[0]?.verifierId || 'verifier-a',
    verifierReceiptHash: afterDigest
  }];
  const chronology = [
    { id: 'evt-1-ingest', occurredAt: new Date(baseTimeMs + 1000).toISOString(), sequence: 1, phase: 'observation', kind: 'alert_ingestion', actorId: 'security-ingestor', summary: 'Ingested canonical security alerts', evidenceRefs: [observations[0].id] },
    { id: 'evt-2-execute', occurredAt: new Date(baseTimeMs + 35000).toISOString(), sequence: 2, phase: 'action', kind: 'candidate_execution', actorId: 'campaign-runner', summary: 'Executed isolated remediation candidates', evidenceRefs: [executed[0].id] },
    { id: 'evt-3-verify', occurredAt: new Date(baseTimeMs + 65000).toISOString(), sequence: 3, phase: 'verification', kind: 'independent_verification', actorId: 'verifier-quorum', summary: 'Verified candidates against control baseline', evidenceRefs: ['diff-remediation-1'] }
  ];
  return { actions: { authorized, executed }, beforeAfter, chronology };
}

function fromRemediationCampaign(input) {
  if (!input?.mandate || !input?.batch || !input?.campaign || !input?.adjudication) {
    throw failure('SERE_CAMPAIGN_ARTIFACTS_REQUIRED');
  }
  const built = buildCampaignInputFromArtifacts(input);
  const operational = buildCampaignOperationalInput(input, built);
  const visibilityLimitations = input.visibilityLimitations || [{
    id: 'lim-isolated-fixture',
    scope: built.targetDefault,
    category: 'environment_isolation',
    description: 'Verification ran inside a network-disabled copy-on-write fixture without live traffic.',
    reason: 'Safety rule forbids live target access and exploit execution.',
    impactOnConclusion: 'Confirms code-level path blocking in fixture; requires staging gate before production.',
    affectedHypothesisIds: [built.hypotheses[0]?.id].filter(Boolean)
  }];
  const decisions = input.decisions || [{
    id: 'dec-campaign-1',
    title: 'Adjudicate remediation candidate for promotion gate review',
    disposition: 'hold_promotion',
    responsible: { actorId: 'sec-lead-1', name: 'Security Lead', role: 'security_adjudicator', authorityRef: 'mandate://security-board' },
    decidedAt: new Date(built.baseTimeMs + 90000).toISOString(),
    rationale: 'Candidate passed independent verifier quorum in fixture; hold for human promotion gate.',
    evidenceRefs: ['diff-remediation-1', built.hypotheses[0]?.id].filter(Boolean),
    receiptHash: input.adjudication.adjudicationHash
  }];
  return assembleSereDossier({
    reportId: input.reportId || `sere-${input.adjudication.adjudicationHash.slice(0, 12)}`,
    mandate: input.mandate,
    observations: built.observations,
    chronology: operational.chronology,
    hypotheses: { items: built.hypotheses },
    actions: operational.actions,
    beforeAfter: operational.beforeAfter,
    visibilityLimitations,
    decisions
  });
}

module.exports = {
  assembleSereDossier,
  fromRemediationCampaign
};
