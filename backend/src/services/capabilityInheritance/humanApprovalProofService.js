'use strict';

const { randomUUID } = require('node:crypto');
const execution = require('../strategyExecutionService');
const approvalPolicy = require('../platformApprovalPolicy');
const signatureService = require('../promotionSignatureService');
const dbStore = require('../../db');

async function issueHumanApprovalProof(input) {
  assertHumanDecision(input);
  const run = await scopedRun(input);
  assertApprovableRun(run, input.user);
  const payloadHash = await execution.getPromotionApprovalDigest(input.db, input.runId);
  if (payloadHash !== input.payloadHash) throw proofError('GCI_APPROVAL_DIGEST_STALE', 409);
  const proof = signedProof(input, payloadHash);
  await recordIssuance(input, proof);
  return { proof, expiresAt: new Date(proof.timestamp + 300000).toISOString() };
}

function assertHumanDecision(input) {
  if (input.user?.authMethod !== 'session' || !input.user.username) throw proofError('GCI_HUMAN_SESSION_REQUIRED', 403);
  if (input.decision !== 'approve') throw proofError('GCI_APPROVAL_DECISION_REQUIRED', 400);
  if (!/^[a-f0-9]{64}$/.test(input.payloadHash || '')) throw proofError('GCI_APPROVAL_DIGEST_INVALID', 400);
}

async function scopedRun(input) {
  const row = await input.db.get(`SELECT r.id, r.status, r.agent_id AS agentId, c.created_by AS requester
    FROM strategy_execution_runs r
    JOIN agents a ON a.id = r.agent_id
    JOIN workspaces w ON w.id = a.workspace_id
    JOIN strategy_contracts c ON c.id = r.contract_id
    WHERE r.id = ? AND w.organization_id = ? AND w.project_id = ?`,
  input.runId, input.organizationId, input.projectId);
  if (!row) throw proofError('GCI_APPROVAL_RUN_NOT_FOUND', 404);
  return row;
}

function assertApprovableRun(run, user) {
  if (run.status !== 'awaiting_approval') throw proofError('GCI_APPROVAL_RUN_NOT_PENDING', 409);
  if (!run.requester || approvalPolicy.isSelfApproval(run.requester, user)) {
    throw proofError('GCI_APPROVAL_SEPARATION_REQUIRED', 409);
  }
}

function signedProof(input, payloadHash) {
  const timestamp = Date.now();
  const signerId = input.user.username;
  const humanApprovalReceipt = { approved: true, approvalId: randomUUID(), approverId: signerId,
    approvedAt: new Date(timestamp).toISOString(), payloadHash };
  const signature = signatureService.generateSignature({ runId: input.runId, timestamp, signerId, payloadHash });
  return { runId: input.runId, signerId, timestamp, signature, humanApprovalReceipt };
}

async function recordIssuance(input, proof) {
  const event = { schema: 'genos.gci.human-approval-proof/v1', approvalId: proof.humanApprovalReceipt.approvalId,
    runId: input.runId, signerId: proof.signerId, payloadHash: proof.humanApprovalReceipt.payloadHash,
    issuedAt: proof.humanApprovalReceipt.approvedAt, expiresAt: new Date(proof.timestamp + 300000).toISOString() };
  await dbStore.withTransaction(input.db, (tx) => tx.run(`INSERT INTO gci_event_ledger
    (id, organization_id, project_id, event_type, event_json)
    VALUES (?, ?, ?, 'human_approval_proof_issued', ?)`,
  [proof.humanApprovalReceipt.approvalId, input.organizationId, input.projectId, JSON.stringify(event)]));
}

function proofError(code, status) {
  return Object.assign(new Error(code), { code, status });
}

module.exports = { issueHumanApprovalProof };
