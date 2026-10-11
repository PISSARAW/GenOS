'use strict';

const { createHash } = require('crypto');
const store = require('../holobiontStore');
const { stopHolobiont } = require('../runtime/stopConditionsService');

const RESULT_GATES = Object.freeze({
  planPlacement: (result) => result?.accepted === true,
  planPlacementBatch: (result) => result?.accepted === true,
  validateToolManifest: (result) => result?.valid === true,
  validateToolInvocation: (result) => result?.valid === true,
  authorizeToolInvocation: (result) => result?.allowed === true,
  executeToolInvocation: (result) => result?.executed === true && result.accepted === true,
  authorizeCompetitiveReplacement: (result) => result?.replacementAuthorized === true,
  createSymbiosisContract: (result) => result?.accepted !== false,
  startSymbiontAdmission: (result) => result?.accepted !== false,
  evaluateSymbiontTrial: (result) => result?.accepted !== false
});

function guardVerdict(result) {
  if (result.verdict !== 'PASS') return result;
  const failedOperations = result.workflow.completed.filter((receipt) => {
    const gate = RESULT_GATES[receipt.operation];
    return receipt.result?.accepted === false || (gate && !gate(receipt.result));
  }).map((receipt) => receipt.operation);
  if (!failedOperations.length) return result;
  return { ...result, verdict: 'FAIL', failedOperations,
    reason: `Operation outcome refused: ${failedOperations.join(', ')}.` };
}

function blocked(reason) {
  return { stopped: false, disposition: 'ACTIVE', reasons: [reason] };
}

async function workspaceBound(db, input) {
  if (typeof input.workspaceId !== 'string' || !input.workspaceId.trim()) return false;
  const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', input.hostId);
  const workspace = await db.get('SELECT id, project_id, organization_id FROM workspaces WHERE id = ?', input.workspaceId);
  return Boolean(agent && workspace && agent.workspace_id === input.workspaceId
    && (input.projectId == null || input.projectId === workspace.project_id)
    && (input.organizationId == null || input.organizationId === workspace.organization_id));
}

function workflowHash(workflow) {
  return createHash('sha256').update(JSON.stringify(workflow)).digest('hex');
}

function proofIdentityValid(proof, binding) {
  return proof.missionId === binding.missionId && proof.holobiontId === binding.holobiontId
    && proof.workflowHash === binding.workflowHash && typeof proof.verifierId === 'string'
    && Boolean(proof.verifierId.trim()) && proof.verifierId !== binding.hostId;
}

function proofEvidenceValid(proof, binding) {
  return Array.isArray(proof.evidenceRefs) && proof.evidenceRefs.length > 0
    && proof.evidenceRefs.every((ref) => binding.evidenceRefs.includes(ref));
}

function proofValid(proof, binding) {
  return Boolean(proof && proof.status === 'VERIFIED' && proof.immunePassed === true
    && proofIdentityValid(proof, binding) && proofEvidenceValid(proof, binding));
}

async function verifiedStopProof(context) {
  const { input, result, deadline, wait } = context;
  const binding = { missionId: result.missionId, holobiontId: result.holobiontId,
    hostId: result.hostId, workflowHash: workflowHash(result.workflow),
    evidenceRefs: result.evidenceRefs };
  const proof = await wait(input.verifyLifecycleEvidence({ ...binding, verdict: result.verdict,
    verifierIds: result.verifierIds, signal: deadline.signal }), deadline.signal);
  return proofValid(proof, binding) ? proof : null;
}

async function finalizeLifecycle(db, context) {
  const { input, result } = context;
  if (result.verdict !== 'PASS') return { ...result, lifecycle: blocked('MISSION_NOT_VERIFIED'), stopped: false };
  if (typeof input.verifyLifecycleEvidence !== 'function') {
    return { ...result, lifecycle: blocked('STOP_EVIDENCE_REQUIRED'), stopped: false };
  }
  if (!await workspaceBound(db, input)) {
    return { ...result, lifecycle: blocked('WORKSPACE_IDENTITY_UNVERIFIED'), stopped: false };
  }
  const proof = await verifiedStopProof(context);
  if (!proof) return { ...result, lifecycle: blocked('STOP_EVIDENCE_INVALID'), stopped: false };
  const session = await store.getSession(db, result.holobiontId);
  const lifecycle = await stopHolobiont(db, { holobiontId: result.holobiontId,
    expectedSessionRevision: session.revision, missionId: result.missionId,
    missionCompleted: true, allPromotedOutputsImmunePassed: true,
    missionActive: false, unresolvedCriticalFailures: 0,
    stopEvidence: { verifierId: proof.verifierId, workflowHash: proof.workflowHash,
      evidenceRefs: proof.evidenceRefs } });
  return { ...result, lifecycle, stopped: lifecycle.stopped === true };
}

module.exports = { guardVerdict, finalizeLifecycle };
