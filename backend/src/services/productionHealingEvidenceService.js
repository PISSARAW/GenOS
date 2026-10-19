'use strict';

const { fingerprint } = require('./stateFingerprint');
const { validateReceipt } = require('./epistemicVerifierReceiptService');
const trustRegistry = require('./verifierTrustRegistry');

function failure(code) { return Object.assign(new Error(code), { code }); }

function requiredText(value, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw failure(code);
  return value.trim();
}

async function scopedCampaign(db, input) {
  const campaign = await db.get(`SELECT * FROM production_healing_campaigns
    WHERE id = ? AND organization_id = ? AND project_id = ?`,
  [input.campaignId, input.organizationId, input.projectId]);
  if (!campaign) throw failure('PRODUCTION_HEALING_CAMPAIGN_NOT_FOUND');
  return { ...campaign, plan: JSON.parse(campaign.plan_json) };
}

function candidateOf(campaign, candidateId) {
  const candidate = campaign.plan.candidates.find(item => item.id === candidateId);
  if (!candidate) throw failure('PRODUCTION_HEALING_CANDIDATE_NOT_FOUND');
  return candidate;
}

function validMeasurements(values) {
  const numbers = [values.requests, values.errors, values.averageLatencyMs, values.costUsd];
  return numbers.every(value => Number.isFinite(value) && value >= 0)
    && Number.isSafeInteger(values.requests) && values.requests > 0
    && Number.isSafeInteger(values.errors) && values.errors <= values.requests;
}

function normalizedEvidenceRefs(outcome) {
  if (!Array.isArray(outcome.evidenceRefs)) return [];
  return [...new Set(outcome.evidenceRefs.map(String))];
}

function validEvidenceRefs(refs) {
  return refs.length >= 2 && refs.length <= 20
    && refs.every(ref => Boolean(ref) && ref.length <= 512);
}

function normalizedOutcome(input) {
  const outcome = input?.outcome || {};
  const values = { requests: Number(outcome.requests), errors: Number(outcome.errors),
    averageLatencyMs: Number(outcome.averageLatencyMs), costUsd: Number(outcome.costUsd ?? 0) };
  const evidenceRefs = normalizedEvidenceRefs(outcome);
  if (!validMeasurements(values) || !validEvidenceRefs(evidenceRefs)) {
    throw failure('PRODUCTION_HEALING_RESULT_INVALID');
  }
  return { executionStatus: outcome.executionStatus === 'failed' ? 'failed' : 'completed',
    ...values, errorRate: values.errors / values.requests, evidenceRefs };
}

async function recordCandidateResult(db, input) {
  const scope = { campaignId: requiredText(input?.campaignId,
    'PRODUCTION_HEALING_CAMPAIGN_REQUIRED'), organizationId: requiredText(input?.organizationId,
    'PRODUCTION_HEALING_ORGANIZATION_REQUIRED'), projectId: requiredText(input?.projectId,
    'PRODUCTION_HEALING_PROJECT_REQUIRED') };
  const candidateId = requiredText(input?.candidateId, 'PRODUCTION_HEALING_CANDIDATE_REQUIRED');
  const executorId = requiredText(input?.executorId, 'PRODUCTION_HEALING_EXECUTOR_REQUIRED');
  const campaign = await scopedCampaign(db, scope);
  const candidate = candidateOf(campaign, candidateId);
  if (campaign.status !== 'planned') throw failure('PRODUCTION_HEALING_RESULT_CLOSED');
  const result = { schema: 'genos.production-healing-result/v1', campaignId: campaign.id,
    candidateId, executorId, planHash: campaign.plan_hash, candidate, outcome: normalizedOutcome(input),
    promotionEligible: false, authorizesPromotion: false };
  const resultHash = fingerprint(result);
  await db.run(`INSERT OR IGNORE INTO production_healing_candidate_results
    (campaign_id,candidate_id,executor_id,result_json,result_hash) VALUES(?,?,?,?,?)`,
  [campaign.id, candidateId, executorId, JSON.stringify(result), resultHash]);
  const stored = await db.get(`SELECT * FROM production_healing_candidate_results
    WHERE campaign_id = ? AND candidate_id = ?`, [campaign.id, candidateId]);
  if (stored.result_hash !== resultHash) throw failure('PRODUCTION_HEALING_RESULT_CONFLICT');
  return { ...result, resultHash, replayed: stored.result_json !== JSON.stringify(result) };
}

function verifierActor(receipt, campaign, result) {
  const actorId = receipt?.independenceDescriptor?.actorId;
  if (typeof actorId !== 'string' || !actorId.trim()
    || [campaign.producer_id, result.executor_id].includes(actorId.trim())) {
    throw failure('PRODUCTION_HEALING_VERIFIER_NOT_INDEPENDENT');
  }
  return actorId.trim();
}

function receiptBound(receipt, context) {
  const obligation = `${context.campaign.id}:${context.result.candidate_id}`;
  return receipt.resultId === obligation
    && receipt.evidenceDigest === `sha256:${context.result.result_hash}`
    && receipt.coveredObligations?.includes(obligation)
    && ['verified', 'refuted', 'inconclusive'].includes(receipt.status)
    && validateReceipt(receipt, trustRegistry.listVerifierDigests());
}

async function submitVerifications(db, input) {
  const campaign = await scopedCampaign(db, input);
  if (campaign.status !== 'planned') throw failure('PRODUCTION_HEALING_VERIFICATION_CLOSED');
  candidateOf(campaign, input.candidateId);
  const result = await db.get(`SELECT * FROM production_healing_candidate_results
    WHERE campaign_id = ? AND candidate_id = ?`, [campaign.id, input.candidateId]);
  if (!result) throw failure('PRODUCTION_HEALING_RESULT_REQUIRED');
  if (!Array.isArray(input.receipts) || input.receipts.length < 1 || input.receipts.length > 8) {
    throw failure('PRODUCTION_HEALING_RECEIPTS_REQUIRED');
  }
  const seen = new Set();
  for (const receipt of input.receipts) {
    const actorId = verifierActor(receipt, campaign, result);
    if (seen.has(actorId)) throw failure('PRODUCTION_HEALING_CORRELATED_VERIFIERS');
    seen.add(actorId);
    if (!receiptBound(receipt, { campaign, result })) {
      throw failure('PRODUCTION_HEALING_RECEIPT_INVALID');
    }
    const receiptHash = fingerprint(receipt);
    await db.run(`INSERT OR IGNORE INTO production_healing_verifications
      (campaign_id,candidate_id,verifier_id,verdict,result_hash,receipt_json,receipt_hash)
      VALUES(?,?,?,?,?,?,?)`, [campaign.id, input.candidateId, actorId, receipt.status,
      result.result_hash, JSON.stringify(receipt), receiptHash]);
    const stored = await db.get(`SELECT receipt_hash FROM production_healing_verifications
      WHERE campaign_id = ? AND candidate_id = ? AND verifier_id = ?`,
    [campaign.id, input.candidateId, actorId]);
    if (stored.receipt_hash !== receiptHash) throw failure('PRODUCTION_HEALING_RECEIPT_CONFLICT');
  }
  return { campaignId: campaign.id, candidateId: input.candidateId,
    acceptedReceipts: seen.size, promotionEligible: false, authorizesPromotion: false };
}

function verifiedResult(context) {
  const { candidate, row, verifications, thresholds } = context;
  if (!row || row.result.outcome.executionStatus !== 'completed') return null;
  const receipts = verifications.filter(item => item.candidate_id === candidate.id);
  if (receipts.some(item => item.verdict === 'refuted')) return null;
  if (new Set(receipts.filter(item => item.verdict === 'verified')
    .map(item => item.verifier_id)).size < 2) return null;
  const outcome = row.result.outcome;
  const withinSlo = outcome.errorRate <= thresholds.maxErrorRate
    && outcome.averageLatencyMs <= thresholds.maxAverageLatencyMs;
  return { candidate, outcome, withinSlo };
}

function score(entry, thresholds) {
  return entry.outcome.errorRate / Math.max(thresholds.maxErrorRate, 0.000001)
    + entry.outcome.averageLatencyMs / Math.max(thresholds.maxAverageLatencyMs, 1)
    + Math.min(entry.outcome.costUsd, 100) / 100;
}

async function qualifyCampaign(db, input) {
  const campaign = await scopedCampaign(db, input);
  if (campaign.status === 'ready_for_canary') return { campaignId: campaign.id,
    selectedCandidateId: campaign.selected_candidate_id, status: campaign.status,
    promotionEligible: false, authorizesPromotion: false, replayed: true };
  const rows = await db.all(`SELECT * FROM production_healing_candidate_results
    WHERE campaign_id = ?`, [campaign.id]);
  const verifications = await db.all(`SELECT * FROM production_healing_verifications
    WHERE campaign_id = ?`, [campaign.id]);
  const byCandidate = new Map(rows.map(row => [row.candidate_id,
    { ...row, result: JSON.parse(row.result_json) }]));
  const thresholds = campaign.plan.thresholds;
  const control = verifiedResult({ candidate: candidateOf(campaign, 'no_change'),
    row: byCandidate.get('no_change'), verifications, thresholds });
  if (!control) throw failure('PRODUCTION_HEALING_CONTROL_QUORUM_REQUIRED');
  const eligible = campaign.plan.candidates.filter(item => item.id !== 'no_change')
    .map(candidate => verifiedResult({ candidate, row: byCandidate.get(candidate.id),
      verifications, thresholds })).filter(entry => entry?.withinSlo)
    .filter(entry => score(entry, thresholds) < score(control, thresholds));
  if (!eligible.length) throw failure('PRODUCTION_HEALING_CANDIDATE_QUORUM_REQUIRED');
  eligible.sort((left, right) => score(left, thresholds) - score(right, thresholds));
  const selectedCandidateId = eligible[0].candidate.id;
  await db.run(`UPDATE production_healing_campaigns SET status = 'ready_for_canary',
    selected_candidate_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'planned'`, [selectedCandidateId, campaign.id]);
  return { campaignId: campaign.id, selectedCandidateId, status: 'ready_for_canary',
    canaryReady: true, promotionEligible: false, authorizesPromotion: false };
}

module.exports = { recordCandidateResult, submitVerifications, qualifyCampaign };
