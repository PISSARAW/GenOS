'use strict';

const causalLoop = require('./morphogenesis/causalLoopService');
const outcomeEvidence = require('./morphogenesis/learning/outcomeEvidenceValidation');

const VERIFIED_RECEIPT_SCHEMA = 'genos.native-oracle-receipt-reference/v1';

async function observe(db, input) {
  const { run, biologicalReceipt, event } = input;
  if (!eligibleRun(run, biologicalReceipt, event)) return { status: 'refused', reason: 'verified_quality_input_required' };
  const scope = await runScope(db, run.agent_id);
  if (!scope) return { status: 'refused', reason: 'agent_scope_unavailable' };
  const actionId = run.id;
  const qualityEvidence = event.payload.qualityEvidence;
  const binding = { actionId, agentId: run.agent_id,
    organizationId: scope.organizationId, projectId: scope.projectId };
  if (!outcomeEvidence.validate(qualityEvidence, binding)) {
    return { status: 'refused', reason: 'signed_quality_evidence_binding_required' };
  }
  const receipt = causalLoop.processActionReceipt({
    agentId: run.agent_id,
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    actionReceipt: actionReceipt(run, event, qualityEvidence)
  });
  return { status: receipt.outcome?.qualityVerified ? 'observed' : 'refused', receipt };
}

function eligibleRun(run, receipt, event) {
  return run?.status === 'completed' && receipt?.result?.verified === true
    && receipt?.budgetAssessment?.satisfied === true
    && receipt?.semanticVerification?.schema === VERIFIED_RECEIPT_SCHEMA
    && event?.eventType === 'AGENT_COMPLETED'
    && event.payload?.qualityEvidence;
}

async function runScope(db, agentId) {
  const row = await db.get(`SELECT w.organization_id AS organizationId, w.project_id AS projectId
    FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, agentId);
  if (!row || Boolean(row.organizationId) !== Boolean(row.projectId)) return null;
  return { organizationId: row.organizationId || null, projectId: row.projectId || null };
}

function actionReceipt(run, event, qualityEvidence) {
  const value = Number(qualityEvidence.value);
  return {
    actionId: run.id,
    actionType: 'verified_strategy_execution',
    actionInput: `strategy execution ${run.id}`,
    observationOutput: `Independent verifier recorded ${qualityEvidence.success ? 'success' : 'failure'} at quality ${value}.`,
    outcome: { success: qualityEvidence.success, quality: value, status: 'completed' },
    expectedOutcome: { success: true, quality: 0.5 },
    qualityEvidence,
    evidence: {
      id: `causal-quality:${qualityEvidence.receiptId}`,
      type: 'verified_outcome',
      statement: `Independent verifier evidence ${qualityEvidence.receiptId} is bound to run ${run.id}.`,
      evidence: [qualityEvidence.receiptId],
      provenance: { source: 'native_worker_execution', runId: run.id, eventType: event.eventType }
    }
  };
}

module.exports = { observe };
