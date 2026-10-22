'use strict';

const {
  KERNEL_SCHEMA,
  PRINCIPAL_KINDS,
  ALLOWED_SECURITY_OPERATIONS,
  sakFailure,
  requiredText
} = require('./sakPrimitives');
const {
  ingestObservedData,
  assertInstructionSeparation,
  detectLogOrReportInjection,
  sanitizeObservedText
} = require('./observationInstructionBarrier');
const {
  createTamperEvidentAuthLog,
  verifyAuthLogIntegrity
} = require('./tamperEvidentAuthLog');
const {
  validatePrincipalRegistration,
  assertExpectedPrincipalKind,
  validateGrantScope,
  buildPermissionGrant
} = require('./sakRegistryAndGrants');
const {
  evaluateAuthorization,
  runActuatorWithPermit
} = require('./sakEvaluator');

function registerPrincipalInState(state, principalSpec = {}) {
  const record = validatePrincipalRegistration(principalSpec);
  const existingKind = state.rawIdToKind.get(record.rawId);
  if (existingKind && existingKind !== record.kind) {
    state.authLog.append({
      eventType: 'principal_registration_rejected',
      decision: 'deny',
      reasonCode: 'SAK_IDENTITY_ROLE_COLLISION',
      principalIds: { candidateId: record.id, conflictingKind: existingKind }
    });
    throw sakFailure('SAK_IDENTITY_ROLE_COLLISION', `Identity ${record.rawId} already bound to role ${existingKind}`);
  }
  state.rawIdToKind.set(record.rawId, record.kind);
  state.principals.set(record.id, record);
  state.authLog.append({
    eventType: 'principal_registered',
    decision: 'info',
    reasonCode: 'SAK_PRINCIPAL_REGISTERED',
    principalIds: { [record.kind]: record.id }
  });
  return record;
}

function issuePermissionGrantInState(state, spec = {}) {
  const operator = assertExpectedPrincipalKind(state.principals, spec.operatorId, 'operator');
  const agent = assertExpectedPrincipalKind(state.principals, spec.agentId, 'agent');
  const actuator = assertExpectedPrincipalKind(state.principals, spec.actuatorId, 'actuator');
  if (state.revokedPrincipals.has(operator.id)) {
    throw sakFailure('SAK_PRINCIPAL_REVOKED', `Operator ${operator.id} is revoked and cannot issue grants.`);
  }
  const scope = validateGrantScope(spec);
  const grant = buildPermissionGrant({ operator, agent, actuator }, scope, spec);
  state.grants.set(grant.grantId, grant);
  state.authLog.append({
    eventType: 'grant_issued',
    decision: 'allow',
    reasonCode: 'SAK_GRANT_ISSUED',
    timestampMs: scope.issuedAtMs,
    principalIds: { operatorId: operator.id, agentId: agent.id, actuatorId: actuator.id },
    target: grant.target,
    operation: grant.operation,
    grantId: grant.grantId,
    details: { durationMs: grant.durationMs, expiresAtMs: grant.expiresAtMs, ticketRef: grant.ticketRef }
  });
  return grant;
}

function revokeGrantInState(state, revocation = {}) {
  const grantId = requiredText(revocation.grantId, 'SAK_GRANT_ID_REQUIRED', 128);
  const grant = state.grants.get(grantId);
  if (!grant) throw sakFailure('SAK_GRANT_UNKNOWN', `Unknown grant: ${grantId}`);
  if (revocation.operatorId) {
    assertExpectedPrincipalKind(state.principals, revocation.operatorId, 'operator');
  }
  const revokedAtMs = Number.isFinite(revocation.revokedAtMs) ? Number(revocation.revokedAtMs) : Date.now();
  const record = Object.freeze({
    grantId,
    revokedAtMs,
    revokedBy: revocation.operatorId ?? 'kernel:emergency',
    reason: requiredText(revocation.reason ?? 'Immediate security revocation', 'SAK_REVOKE_REASON_REQUIRED', 256)
  });
  state.revokedGrants.set(grantId, record);
  state.authLog.append({
    eventType: 'grant_revoked',
    decision: 'deny',
    reasonCode: 'SAK_GRANT_REVOKED',
    timestampMs: revokedAtMs,
    principalIds: { revokedBy: record.revokedBy, agentId: grant.agentId, actuatorId: grant.actuatorId },
    target: grant.target,
    operation: grant.operation,
    grantId
  });
  return record;
}

function revokePrincipalInState(state, revocation = {}) {
  const principalId = requiredText(revocation.principalId, 'SAK_PRINCIPAL_ID_REQUIRED', 128);
  if (!state.principals.has(principalId)) {
    throw sakFailure('SAK_PRINCIPAL_UNKNOWN', `Unknown principal: ${principalId}`);
  }
  const revokedAtMs = Number.isFinite(revocation.revokedAtMs) ? Number(revocation.revokedAtMs) : Date.now();
  const record = Object.freeze({
    principalId,
    revokedAtMs,
    reason: requiredText(revocation.reason ?? 'Immediate principal revocation', 'SAK_REVOKE_REASON_REQUIRED', 256)
  });
  state.revokedPrincipals.set(principalId, record);
  state.authLog.append({
    eventType: 'principal_revoked',
    decision: 'deny',
    reasonCode: 'SAK_PRINCIPAL_REVOKED',
    timestampMs: revokedAtMs,
    principalIds: { principalId }
  });
  return record;
}

function ingestObservedArtifactInState(state, rawContent, metadata = {}) {
  const envelope = ingestObservedData(rawContent, metadata);
  const decision = envelope.injectionDetected ? 'quarantine' : 'info';
  const reasonCode = envelope.injectionDetected ? 'SAK_LOG_INJECTION_NEUTRALIZED' : 'SAK_OBSERVED_DATA_SEALED';
  state.authLog.append({
    eventType: 'observed_data_ingested',
    decision,
    reasonCode,
    details: {
      sourceFormat: envelope.sourceFormat,
      originRef: envelope.originRef,
      injectionDetected: envelope.injectionDetected,
      matchedInjectionRules: envelope.matchedInjectionRules,
      envelopeHash: envelope.envelopeHash
    }
  });
  return envelope;
}

function createSecurityAuthorityKernel(options = {}) {
  const secret = requiredText(options.secret ?? 'genos-sak-kernel-root-secret-v1', 'SAK_SECRET_REQUIRED', 512);
  const authLog = createTamperEvidentAuthLog({ secret });
  const state = {
    secret,
    authLog,
    principals: new Map(),
    rawIdToKind: new Map(),
    grants: new Map(),
    revokedGrants: new Map(),
    revokedPrincipals: new Map()
  };

  return Object.freeze({
    schema: KERNEL_SCHEMA,
    defaultPolicy: 'deny',
    registerPrincipal: (spec) => registerPrincipalInState(state, spec),
    issuePermissionGrant: (spec) => issuePermissionGrantInState(state, spec),
    revokeGrant: (revocation) => revokeGrantInState(state, revocation),
    revokePrincipal: (revocation) => revokePrincipalInState(state, revocation),
    ingestObservedArtifact: (rawContent, metadata) => ingestObservedArtifactInState(state, rawContent, metadata),
    authorizeOperation: (request) => evaluateAuthorization(state, request),
    executeWithActuator: (request, handler) => runActuatorWithPermit(state, request, handler),
    getAuthLog: () => authLog.getEntries(),
    verifyAuthLog: (entries) => authLog.verify(entries)
  });
}

module.exports = {
  KERNEL_SCHEMA,
  PRINCIPAL_KINDS,
  ALLOWED_SECURITY_OPERATIONS,
  createSecurityAuthorityKernel,
  ingestObservedData,
  assertInstructionSeparation,
  detectLogOrReportInjection,
  sanitizeObservedText,
  verifyAuthLogIntegrity
};
