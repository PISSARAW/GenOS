'use strict';

const { withTransaction } = require('../../db');
const { canonicalJson } = require('./durableJson');
const { ensureTables } = require('./asyncDelegationPlanService');
const { missionRow, assertLease } = require('./asyncDelegationRuntimeService');

const OUTCOMES = new Set(['ACCEPT', 'NO_CHANGE', 'HUMAN_REVIEW']);

function parseCheckpoint(row) {
  const payload = JSON.parse(row.state_json);
  return { sequence: row.sequence, stepId: row.step_id, fence: row.fence,
    stateHash: row.state_hash, artifactRef: row.artifact_ref,
    state: payload.state || {}, evidenceRefs: payload.evidenceRefs || [] };
}

async function checkpointsFor(db, missionId) {
  const rows = await db.all(`SELECT * FROM ontogenesis_delegation_checkpoints
    WHERE mission_id = ? ORDER BY sequence`, [missionId]);
  return rows.map(parseCheckpoint);
}

function checkpointNamed(checkpoints, id) {
  return checkpoints.find((checkpoint) => checkpoint.stepId === id);
}

function requireEvidence(checkpoint, code) {
  if (!checkpoint || checkpoint.evidenceRefs.length === 0) throw new Error(code);
  return checkpoint;
}

function acceptDecision(row, checkpoints) {
  const verification = requireEvidence(checkpointNamed(checkpoints, 'independent_verify'),
    'preuve-independante-manquante');
  const effect = requireEvidence(checkpointNamed(checkpoints, 'post_integration_effect'),
    'preuve-effet-post-integration-manquante');
  if (!verification.state.verifierId || verification.state.verifierId === row.producer_id) {
    throw new Error('verificateur-non-independant');
  }
  if (verification.state.verdict !== 'accepted' || !verification.state.candidateRevision) {
    throw new Error('verification-independante-non-concluante');
  }
  if (effect.state.projectResult !== 'confirmed' || !effect.state.integratedRevision) {
    throw new Error('effet-projet-post-integration-non-confirme');
  }
  return { outcome: 'ACCEPT', candidateRevision: verification.state.candidateRevision,
    integratedRevision: effect.state.integratedRevision, verifierId: verification.state.verifierId };
}

function noChangeDecision(checkpoints, input) {
  const scope = requireEvidence(checkpointNamed(checkpoints, 'scope'), 'preuve-no-change-manquante');
  if (checkpointNamed(checkpoints, 'execute_isolated')) throw new Error('no-change-apres-mutation-interdit');
  if (!input.reason) throw new Error('raison-no-change-requise');
  return { outcome: 'NO_CHANGE', reason: input.reason, evidenceRefs: scope.evidenceRefs };
}

function humanReviewDecision(input) {
  if (!input.reason || !input.reviewRef) throw new Error('revue-humaine-documentee-requise');
  return { outcome: 'HUMAN_REVIEW', reason: input.reason, reviewRef: input.reviewRef };
}

function decisionFor(row, checkpoints, input) {
  if (!OUTCOMES.has(input.outcome)) throw new Error('issue-delegation-inconnue');
  if (input.outcome === 'ACCEPT') return acceptDecision(row, checkpoints);
  if (input.outcome === 'NO_CHANGE') return noChangeDecision(checkpoints, input);
  return humanReviewDecision(input);
}

function statusFor(outcome) {
  return { ACCEPT: 'accepted', NO_CHANGE: 'no_change', HUMAN_REVIEW: 'human_review' }[outcome];
}

async function persistDecision(db, input) {
  const row = await missionRow(db, input.missionId);
  assertLease(row, input);
  const checkpoints = await checkpointsFor(db, row.id);
  const decision = decisionFor(row, checkpoints, input);
  const status = statusFor(decision.outcome);
  const receipt = { ...decision, missionId: row.id, planHash: row.plan_hash,
    mandateVersion: row.mandate_version,
    checkpointHashes: checkpoints.map((checkpoint) => checkpoint.stateHash) };
  const update = await db.run(`UPDATE ontogenesis_delegations
    SET status = ?, decision_json = ?, lease_owner = NULL, lease_expires_at = NULL,
      updated_at = datetime('now')
    WHERE id = ? AND status = 'running' AND lease_owner = ? AND fence = ?`,
  [status, canonicalJson(receipt), row.id, input.owner, input.fence]);
  if (update.changes !== 1) throw new Error('decision-delegation-concurrente');
  return receipt;
}

async function closeDelegation(db, input) {
  await ensureTables(db);
  return withTransaction(db, () => persistDecision(db, input));
}

module.exports = { closeDelegation, checkpointsFor, decisionFor };
