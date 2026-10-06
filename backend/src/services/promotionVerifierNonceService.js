'use strict';

const { withTransaction } = require('../db');
const { readAssembly } = require('./aeisAssemblyStore');
const { claimVerifierNonce } = require('./strategyPromotionPolicyService');

function refuse(message, code = 'PROMOTION_RECEIPT_BINDING') {
  throw Object.assign(new Error(message), { code });
}

function needsAssembly(context) {
  return Boolean(context.epistemicAssembly || context.independentVerifierReceipt || context.report?.claims?.length);
}

async function trustedRunScope(db, promotion) {
  const row = await db.get(`SELECT r.agent_id, r.status, w.id AS workspace_id, w.organization_id, w.project_id
    FROM strategy_execution_runs r JOIN agents a ON a.id = r.agent_id
    JOIN workspaces w ON w.id = a.workspace_id WHERE r.id = ?`, promotion.runId);
  if (!row || row.agent_id !== promotion.agentId || row.status !== 'awaiting_approval') {
    refuse('Verifier receipts require the owning run awaiting approval.');
  }
  return [row.organization_id || 'local', row.project_id || 'local', row.workspace_id].join(':');
}

function assertAssemblyBinding(saved, promotion, scopeId) {
  if (saved.runId !== promotion.runId || saved.scopeId !== scopeId) {
    refuse('Verifier assembly does not belong to this run and scope.');
  }
  if (saved.evaluation.evaluation?.eligible !== true || saved.evaluation.allAccepted !== true) {
    refuse('Verifier assembly is not accepted for promotion.');
  }
}

function boundPositive(receipt, results) {
  return receipt.status === 'verified' && typeof receipt.nonce === 'string'
    && receipt.nonce.trim().length > 0 && typeof receipt.evidenceDigest === 'string'
    && results.has(receipt.resultId) && results.get(receipt.resultId) === receipt.evidenceDigest;
}

function independentReceipts(assembly) {
  const results = new Map(assembly.results.map(result => [result.resultId, result.evidence?.digest]));
  const receipts = assembly.verifications.filter(receipt => receipt.independent === true);
  if (!receipts.length || !receipts.every(receipt => boundPositive(receipt, results))) {
    refuse('Independent verifier receipts must be positive and evidence-bound.');
  }
  return receipts;
}

async function consumeReceipts(db, receipts) {
  for (const receipt of receipts) {
    const violation = await claimVerifierNonce(db, { independentVerifierReceipt: receipt });
    if (violation) refuse(violation.message, violation.policy);
  }
  return { consumed: receipts.length };
}

async function consume(db, input) {
  const { promotion, gateContext } = input;
  const assemblyId = gateContext.aeisEvaluation?.persistedAssemblyId;
  if (!assemblyId) {
    if (needsAssembly(gateContext)) refuse('Promotion requires a persisted verifier assembly.');
    return { consumed: 0 };
  }
  return withTransaction(db, async () => {
    const scopeId = await trustedRunScope(db, promotion);
    const saved = await readAssembly(db, assemblyId);
    assertAssemblyBinding(saved, promotion, scopeId);
    return consumeReceipts(db, independentReceipts(saved.evaluation.assembly));
  });
}

module.exports = { consume };
