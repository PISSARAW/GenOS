'use strict';

const { fingerprint } = require('./stateFingerprint');

function failure(code) { return Object.assign(new Error(code), { code }); }

async function campaignFor(db, input) {
  const row = await db.get(`SELECT * FROM production_healing_campaigns
    WHERE id = ? AND organization_id = ? AND project_id = ?`,
  [input.campaignId, input.organizationId, input.projectId]);
  if (!row) throw failure('PRODUCTION_HEALING_CAMPAIGN_NOT_FOUND');
  return row;
}

async function rolloutFor(db, input) {
  const row = await db.get(`SELECT rr.*, r.organization_id, r.project_id
    FROM release_rollouts rr JOIN releases r ON r.id = rr.release_id
    WHERE rr.id = ? AND r.organization_id = ? AND r.project_id = ?`,
  [input.rolloutId, input.organizationId, input.projectId]);
  if (!row) throw failure('PRODUCTION_HEALING_ROLLOUT_NOT_FOUND');
  return { ...row, config: JSON.parse(row.config_json) };
}

function candidateReference(campaign) {
  return `production-healing:${campaign.id}:${campaign.selected_candidate_id}`;
}

function assertBound(campaign, rollout) {
  if (rollout.strategy !== 'canary' || rollout.config.candidateRef !== candidateReference(campaign)) {
    throw failure('PRODUCTION_HEALING_ROLLOUT_BINDING_INVALID');
  }
}

async function bindCanary(db, input) {
  const campaign = await campaignFor(db, input);
  if (campaign.status === 'canary_running' && campaign.rollout_id === input.rolloutId) {
    return { campaignId: campaign.id, rolloutId: input.rolloutId, status: campaign.status,
      replayed: true, authorizesPromotion: false };
  }
  if (campaign.status !== 'ready_for_canary') {
    throw failure('PRODUCTION_HEALING_CAMPAIGN_NOT_READY');
  }
  const rollout = await rolloutFor(db, input);
  assertBound(campaign, rollout);
  if (!['running', 'paused'].includes(rollout.status)) {
    throw failure('PRODUCTION_HEALING_ROLLOUT_NOT_ACTIVE');
  }
  const changed = await db.run(`UPDATE production_healing_campaigns
    SET status = 'canary_running', rollout_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'ready_for_canary'`, [rollout.id, campaign.id]);
  if (changed.changes !== 1) throw failure('PRODUCTION_HEALING_CAMPAIGN_CHANGED');
  return { campaignId: campaign.id, rolloutId: rollout.id, status: 'canary_running',
    candidateRef: candidateReference(campaign), authorizesPromotion: false };
}

async function evidenceRefs(db, campaign) {
  const result = await db.get(`SELECT result_hash FROM production_healing_candidate_results
    WHERE campaign_id = ? AND candidate_id = ?`, [campaign.id, campaign.selected_candidate_id]);
  const receipts = await db.all(`SELECT receipt_hash FROM production_healing_verifications
    WHERE campaign_id = ? AND candidate_id = ? ORDER BY verifier_id`,
  [campaign.id, campaign.selected_candidate_id]);
  if (!result || receipts.length < 2) throw failure('PRODUCTION_HEALING_EVIDENCE_MISSING');
  return { candidateResultHash: result.result_hash,
    verifierReceiptHashes: receipts.map(item => item.receipt_hash) };
}

function terminalScar(campaign, rollout, refs) {
  const healed = rollout.status === 'promoted';
  const body = { schema: 'genos.production-healing-scar/v1', campaignId: campaign.id,
    rolloutId: rollout.id, selectedCandidateId: campaign.selected_candidate_id,
    outcome: healed ? 'provisionally_healed' : 'rolled_back',
    maturity: healed ? 'provisional' : 'negative_memory',
    rolloutDecision: rollout.decision_json ? JSON.parse(rollout.decision_json) : null,
    ...refs, causalClaim: false, longitudinalMonitoringRequired: healed,
    recordedAt: new Date().toISOString() };
  return { ...body, scarHash: fingerprint(body) };
}

async function closeCanary(db, input) {
  const campaign = await campaignFor(db, input);
  if (['healed', 'failed'].includes(campaign.status)) {
    return { campaignId: campaign.id, status: campaign.status,
      scar: JSON.parse(campaign.scar_json), replayed: true };
  }
  if (campaign.status !== 'canary_running' || campaign.rollout_id !== input.rolloutId) {
    throw failure('PRODUCTION_HEALING_CANARY_NOT_BOUND');
  }
  const rollout = await rolloutFor(db, input);
  assertBound(campaign, rollout);
  if (['running', 'paused'].includes(rollout.status)) {
    return { campaignId: campaign.id, status: 'canary_running', pending: true };
  }
  if (!['promoted', 'rolled_back'].includes(rollout.status)) {
    throw failure('PRODUCTION_HEALING_ROLLOUT_TERMINAL_INVALID');
  }
  const scar = terminalScar(campaign, rollout, await evidenceRefs(db, campaign));
  const status = rollout.status === 'promoted' ? 'healed' : 'failed';
  const changed = await db.run(`UPDATE production_healing_campaigns
    SET status = ?, scar_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'canary_running'`, [status, JSON.stringify(scar), campaign.id]);
  if (changed.changes !== 1) throw failure('PRODUCTION_HEALING_CAMPAIGN_CHANGED');
  return { campaignId: campaign.id, status, scar, authorizesPromotion: false };
}

module.exports = { bindCanary, closeCanary, candidateReference };
