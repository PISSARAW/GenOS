'use strict';

const { fingerprint } = require('../stateFingerprint');
const contract = require('./developmentalCampaignContract');

const WORKSPACE_SCHEMA = 'genos.shev-field-workspace-attestation/v1';
const MEASUREMENT_SCHEMA = 'genos.shev-field-window-measurement/v1';

function assertFunction(value, name) {
  if (typeof value !== 'function') {
    throw contract.failure('SHEV_FIELD_ADAPTER_REQUIRED', `${name} adapter is required.`);
  }
}

function validateAdapters(adapters) {
  assertFunction(adapters?.workspace?.ensureArm, 'workspace.ensureArm');
  assertFunction(adapters?.runtime?.executeWindow, 'runtime.executeWindow');
  assertFunction(adapters?.observer?.measureWindow, 'observer.measureWindow');
  assertFunction(adapters?.verifier?.verifyWindow, 'verifier.verifyWindow');
}

function expectedWorkspace(manifest, armName) {
  const arm = manifest.arms[armName];
  const peer = manifest.arms[armName === 'control' ? 'treatment' : 'control'];
  return { campaignId: manifest.campaignId, manifestHash: manifest.manifestHash,
    arm: armName, projectId: arm.scope.projectId, workspaceId: arm.workspaceId,
    isolatedFrom: peer.workspaceId, initialSnapshotHash: arm.initialSnapshotHash,
    modelLock: arm.modelLock, toolsLock: arm.toolsLock,
    permissionsHash: arm.permissionsHash, intervention: arm.intervention,
    ...(arm.campaignBudget && { campaignBudget: arm.campaignBudget }),
    ...(arm.runtimeLock && { runtimeLock: arm.runtimeLock }),
    ...(arm.environmentLock && { environmentLock: arm.environmentLock }),
    ...(arm.interventionAttestation && { interventionAttestation: arm.interventionAttestation }),
    idempotencyKey: `shev-field:${manifest.manifestHash}:workspace:${armName}` };
}

function attestationBody(attestation) {
  const keys = ['schema', 'campaignId', 'manifestHash', 'arm', 'projectId', 'workspaceId',
    'isolatedFrom', 'initialSnapshotHash', 'modelLock', 'toolsLock', 'permissionsHash',
    'intervention', 'campaignBudget', 'runtimeLock', 'environmentLock',
    'interventionAttestation', 'attestorId', 'evidenceRefs'];
  return Object.fromEntries(keys.filter((key) => attestation?.[key] !== undefined)
    .map((key) => [key, attestation[key]]));
}

function matchingWorkspace(attestation, expected) {
  const keys = ['campaignId', 'manifestHash', 'arm', 'projectId', 'workspaceId',
    'isolatedFrom', 'initialSnapshotHash', 'modelLock', 'toolsLock',
    'permissionsHash', 'intervention', 'campaignBudget', 'runtimeLock',
    'environmentLock', 'interventionAttestation'].filter((key) => expected[key] !== undefined);
  return keys.every((key) => fingerprint(attestation?.[key] ?? null)
    === fingerprint(expected[key] ?? null));
}

function validEvidenceRefs(values) {
  return Array.isArray(values) && values.length > 0 && values.every(contract.validHash);
}

function workspaceEvidence(expected) {
  return [expected.runtimeLock?.evidenceHash, expected.environmentLock?.evidenceHash,
    expected.interventionAttestation?.evidenceHash].filter(Boolean);
}

function validateWorkspaceAttestation(attestation, expected) {
  const body = attestationBody(attestation);
  const valid = attestation?.schema === WORKSPACE_SCHEMA && matchingWorkspace(attestation, expected)
    && typeof attestation.attestorId === 'string' && attestation.attestorId.trim()
    && validEvidenceRefs(attestation.evidenceRefs)
    && workspaceEvidence(expected).every((ref) => attestation.evidenceRefs.includes(ref))
    && attestation.attestationHash === fingerprint(body);
  if (!valid) throw contract.failure('SHEV_FIELD_WORKSPACE_UNVERIFIED',
    `Workspace attestation failed for ${expected.arm}.`);
  return Object.freeze({ ...body, evidenceRefs: Object.freeze([...body.evidenceRefs]),
    attestationHash: attestation.attestationHash });
}

function executionMatches(execution, request) {
  return typeof execution?.executionId === 'string' && execution.executionId.trim()
    && typeof execution.actorId === 'string' && execution.actorId.trim()
    && execution.projectId === request.project.projectId
    && execution.workspaceId === request.workspaceId
    && execution.intervention === request.intervention
    && contract.validHash(execution.artifactHash);
}

function measurementBody(measurement) {
  return { schema: measurement?.schema, executionId: measurement?.executionId,
    collectorId: measurement?.collectorId, measuredAt: measurement?.measuredAt,
    outcome: measurement?.outcome, evidenceRefs: measurement?.evidenceRefs };
}

function validMeasurementIdentity(measurement, execution) {
  return measurement?.schema === MEASUREMENT_SCHEMA
    && measurement.executionId === execution.executionId
    && typeof measurement.collectorId === 'string' && measurement.collectorId.trim()
    && measurement.collectorId !== execution.actorId
    && Number.isFinite(Date.parse(measurement.measuredAt))
    && measurement.outcome?.actorId === execution.actorId
    && measurement.outcome?.artifactHash === execution.artifactHash;
}

function validMeasurementEvidence(measurement, execution, body) {
  return validEvidenceRefs(measurement?.evidenceRefs)
    && measurement.evidenceRefs.includes(execution.artifactHash)
    && measurement.measurementHash === fingerprint(body);
}

function validateMeasurement(measurement, execution) {
  const body = measurementBody(measurement);
  const valid = validMeasurementIdentity(measurement, execution)
    && validMeasurementEvidence(measurement, execution, body);
  if (!valid) throw contract.failure('SHEV_FIELD_MEASUREMENT_UNVERIFIED',
    'External measurement does not bind the execution and its evidence.');
  return Object.freeze({ ...body, evidenceRefs: Object.freeze([...body.evidenceRefs]),
    measurementHash: measurement.measurementHash });
}

function validateCampaignManifest(manifest, expectedMode) {
  const sealed = contract.verifyManifest(manifest);
  const code = expectedMode === 'field' ? 'SHEV_FIELD_MODE_REQUIRED' : 'SHEV_CAMPAIGN_MODE_INVALID';
  if (sealed.mode !== expectedMode) throw contract.failure(code,
    `The ${expectedMode} adapter cannot accept ${sealed.mode} campaigns.`);
  return sealed;
}

function outcomeMatches(measured, normalized) {
  return Object.keys(measured).every((key) =>
    fingerprint(measured[key] ?? null) === fingerprint(normalized?.[key] ?? null));
}

async function prepare(state) {
  for (const armName of ['control', 'treatment']) {
    const expected = expectedWorkspace(state.manifest, armName);
    const actual = await state.adapters.workspace.ensureArm(expected);
    state.attestations.set(armName, validateWorkspaceAttestation(actual, expected));
  }
  return Object.freeze({ manifestHash: state.manifest.manifestHash,
    control: state.attestations.get('control'), treatment: state.attestations.get('treatment') });
}

async function runWindow(state, request) {
  const attestation = state.attestations.get(request.arm);
  if (!attestation) throw contract.failure('SHEV_FIELD_NOT_PREPARED',
    'Field workspaces must be attested before execution.');
  const execution = await state.adapters.runtime.executeWindow({ request, attestation });
  if (!executionMatches(execution, request)) throw contract.failure('SHEV_FIELD_EXECUTION_UNVERIFIED',
    'Runtime execution does not match the sealed arm and workspace.');
  const measured = await state.adapters.observer.measureWindow({ request, execution, attestation });
  const measurement = validateMeasurement(measured, execution);
  state.executions.set(request.idempotencyKey, { request, execution, measurement, attestation });
  return measurement.outcome;
}

function receiptCoversContext(receipt, context) {
  const required = workspaceEvidence(context.request);
  return receipt?.executionId === context.execution.executionId
    && receipt.measurementHash === context.measurement.measurementHash
    && Array.isArray(receipt.evidenceRefs)
    && receipt.evidenceRefs.includes(context.measurement.measurementHash)
    && context.measurement.evidenceRefs.every((ref) => receipt.evidenceRefs.includes(ref))
    && required.every((ref) => receipt.evidenceRefs.includes(ref))
    && fingerprint(receipt.interventionAttestation ?? null)
      === fingerprint(context.request.interventionAttestation ?? null);
}

async function verifyWindow(state, request) {
  const context = state.executions.get(request.idempotencyKey);
  if (!context || !outcomeMatches(context.measurement.outcome, request.outcome)) {
    throw contract.failure('SHEV_FIELD_EXECUTION_CONTEXT_MISSING',
      'Verifier cannot bind this outcome to an observed field execution.');
  }
  const receipt = await state.adapters.verifier.verifyWindow({ ...context, outcome: request.outcome });
  if (!receiptCoversContext(receipt, context)) throw contract.failure('SHEV_FIELD_VERIFICATION_UNBOUND',
    'Verifier receipt does not cover the independent measurement evidence.');
  state.executions.delete(request.idempotencyKey);
  return receipt;
}

function createAdapter(input, mode) {
  const manifest = validateCampaignManifest(input?.manifest, mode);
  validateAdapters(input?.adapters);
  const state = { manifest, adapters: input.adapters, attestations: new Map(), executions: new Map() };
  return Object.freeze({ manifest, prepare: () => prepare(state),
    runWindow: (request) => runWindow(state, request),
    verifyWindow: (request) => verifyWindow(state, request) });
}

function createFieldAdapter(input) { return createAdapter(input, 'field'); }

function createProtocolAdapter(input) { return createAdapter(input, 'protocol'); }

module.exports = { WORKSPACE_SCHEMA, MEASUREMENT_SCHEMA, createFieldAdapter,
  createProtocolAdapter, expectedWorkspace, validateWorkspaceAttestation, validateMeasurement };
