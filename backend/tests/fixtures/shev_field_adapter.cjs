'use strict';

const fs = require('fs');
const path = require('path');
const { fingerprint } = require(path.join(process.env.GENOS_FIELD_TEST_ROOT,
  'backend/src/services/stateFingerprint'));

const WORKSPACE_SCHEMA = 'genos.shev-field-workspace-attestation/v1';
const MEASUREMENT_SCHEMA = 'genos.shev-field-window-measurement/v1';

function workspaceAttestation(expected) {
  const body = { schema: WORKSPACE_SCHEMA, campaignId: expected.campaignId,
    manifestHash: expected.manifestHash, arm: expected.arm, projectId: expected.projectId,
    workspaceId: expected.workspaceId, isolatedFrom: expected.isolatedFrom,
    initialSnapshotHash: expected.initialSnapshotHash, modelLock: expected.modelLock,
    toolsLock: expected.toolsLock, permissionsHash: expected.permissionsHash,
    intervention: expected.intervention,
    ...(expected.campaignBudget && { campaignBudget: expected.campaignBudget }),
    ...(expected.runtimeLock && { runtimeLock: expected.runtimeLock }),
    ...(expected.environmentLock && { environmentLock: expected.environmentLock }),
    ...(expected.interventionAttestation
      && { interventionAttestation: expected.interventionAttestation }),
    attestorId: `test-workspace-${expected.arm}`,
    evidenceRefs: [fingerprint(`workspace:${expected.arm}`), expected.runtimeLock?.evidenceHash,
      expected.environmentLock?.evidenceHash,
      expected.interventionAttestation?.evidenceHash].filter(Boolean) };
  return { ...body, attestationHash: fingerprint(body) };
}

function execution(request) {
  fs.appendFileSync(process.env.SHEV_FIELD_TEST_EXECUTION_LOG,
    `${request.idempotencyKey}\n`, 'utf8');
  return { executionId: `execution-${request.arm}-${request.window.id}`,
    actorId: `producer-${request.arm}`, projectId: request.project.projectId,
    workspaceId: request.workspaceId, intervention: request.intervention,
    artifactHash: fingerprint(`artifact:${request.arm}:${request.window.id}`) };
}

function measurement(request, executed) {
  const treatment = request.arm === 'treatment';
  const outcome = { success: true, projectId: request.project.projectId,
    actorId: executed.actorId, regressions: 0, humanInterventions: treatment ? 0 : 1,
    costUsd: 0.1, durationMs: 100, tokens: 100, painObserved: true,
    painObservationHash: fingerprint(`pain:${executed.executionId}`),
    developmentalPressureBefore: treatment ? 0.1 : null,
    developmentalPressureAfter: treatment ? 0.2 : null, progressResult: 'not_tested',
    clearanceApplied: false, clearanceEvidenceHash: null,
    contextHash: request.window.contextHash, artifactHash: executed.artifactHash };
  const body = { schema: MEASUREMENT_SCHEMA, executionId: executed.executionId,
    collectorId: `observer-${request.arm}`, measuredAt: new Date().toISOString(), outcome,
    evidenceRefs: [executed.artifactHash, outcome.painObservationHash] };
  return { ...body, measurementHash: fingerprint(body) };
}

function receipt(context) {
  const { request, execution: executed, measurement: measured, outcome } = context;
  return { verified: true, verifierId: `verifier-${request.arm}`,
    executionId: executed.executionId, measurementHash: measured.measurementHash,
    projectId: request.project.projectId, workspaceId: request.workspaceId,
    initialSnapshotHash: request.initialSnapshotHash, intervention: request.intervention,
    executionMode: request.mode, conditionsHash: request.conditionsHash,
    artifactHash: outcome.artifactHash, outcomeHash: fingerprint(outcome),
    interventionAttestation: request.interventionAttestation || null,
    evidenceRefs: [...measured.evidenceRefs, measured.measurementHash,
      request.runtimeLock?.evidenceHash, request.environmentLock?.evidenceHash,
      request.interventionAttestation?.evidenceHash].filter(Boolean) };
}

async function createAdapters() {
  return { workspace: { ensureArm: async (expected) => workspaceAttestation(expected) },
    runtime: { executeWindow: async ({ request }) => execution(request) },
    observer: { measureWindow: async ({ request, execution: executed }) =>
      measurement(request, executed) },
    verifier: { verifyWindow: async (context) => receipt(context) } };
}

module.exports = { createAdapters };
