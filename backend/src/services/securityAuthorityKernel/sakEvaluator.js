'use strict';

const {
  sakFailure,
  fingerprint
} = require('./sakPrimitives');
const {
  assertInstructionSeparation
} = require('./observationInstructionBarrier');
const {
  assertExpectedPrincipalKind,
  detectModelBypassAttempt,
  buildExecutionPermit,
  verifyPermitSignature
} = require('./sakRegistryAndGrants');

function denyDecision(authLog, event) {
  const auditEntry = authLog.append({
    eventType: event.eventType || 'authorization_evaluated',
    decision: 'deny',
    reasonCode: event.reasonCode,
    timestampMs: event.nowMs,
    principalIds: event.principalIds,
    target: event.target,
    operation: event.operation,
    grantId: event.grantId,
    details: event.details
  });
  return Object.freeze({
    allowed: false,
    decision: 'deny',
    reasonCode: event.reasonCode,
    message: event.message || event.reasonCode,
    permit: null,
    auditEntry
  });
}

function doesGrantMatchScope(grant, requestContext) {
  const principalsMatch = grant.agentId === requestContext.agentId && grant.actuatorId === requestContext.actuatorId;
  const targetMatches = grant.target === requestContext.target && grant.operation === requestContext.operation;
  return principalsMatch && targetMatches;
}

function isTimestampWithinGrant(nowMs, grant) {
  if (nowMs < grant.issuedAtMs) return false;
  return nowMs < grant.expiresAtMs;
}

function checkGrantValidity(state, grant, requestContext) {
  if (state.revokedGrants.has(grant.grantId)) {
    return { ok: false, code: 'SAK_GRANT_REVOKED', message: `Grant ${grant.grantId} has been revoked.` };
  }
  if (state.revokedPrincipals.has(grant.operatorId)) {
    return { ok: false, code: 'SAK_PRINCIPAL_REVOKED', message: `Operator ${grant.operatorId} is revoked.` };
  }
  if (!doesGrantMatchScope(grant, requestContext)) {
    return { ok: false, code: 'SAK_SCOPE_MISMATCH', message: 'Grant scope does not match request.' };
  }
  if (!isTimestampWithinGrant(requestContext.nowMs, grant)) {
    return { ok: false, code: 'SAK_GRANT_EXPIRED', message: `Grant ${grant.grantId} is expired.` };
  }
  return { ok: true };
}

function selectCandidateGrant(state, requestContext) {
  if (requestContext.grantId) {
    return state.grants.get(requestContext.grantId) || null;
  }
  for (const grant of state.grants.values()) {
    if (doesGrantMatchScope(grant, requestContext)) return grant;
  }
  return null;
}

function verifyActivePrincipals(state, request) {
  const agent = assertExpectedPrincipalKind(state.principals, request.agentId, 'agent');
  const actuator = assertExpectedPrincipalKind(state.principals, request.actuatorId, 'actuator');
  const revoked = state.revokedPrincipals.has(agent.id) || state.revokedPrincipals.has(actuator.id);
  if (revoked) {
    throw sakFailure('SAK_PRINCIPAL_REVOKED', 'Agent or actuator identity is revoked.');
  }
  return { agent, actuator };
}

function evaluatePreChecks(state, request) {
  const bypassFlag = detectModelBypassAttempt(request);
  if (bypassFlag) {
    return { ok: false, code: 'SAK_MODEL_BYPASS_ATTEMPT', message: `Model attempted bypass via ${bypassFlag}` };
  }
  try {
    assertInstructionSeparation(request);
    const { agent, actuator } = verifyActivePrincipals(state, request);
    return { ok: true, agent, actuator };
  } catch (err) {
    return { ok: false, code: err.code || 'SAK_REQUEST_DENIED', message: err.message };
  }
}

function isAnyPermitPrincipalRevoked(state, permit) {
  if (state.revokedPrincipals.has(permit.agentId)) return true;
  if (state.revokedPrincipals.has(permit.actuatorId)) return true;
  return state.revokedPrincipals.has(permit.operatorId);
}

function validatePermitForExecution(state, executionRequest, nowMs) {
  const permit = executionRequest?.permit;
  if (!verifyPermitSignature(permit, state.secret)) {
    throw sakFailure('SAK_PERMIT_FORGED_OR_INVALID', 'Actuator requires a genuine kernel-signed execution permit.');
  }
  if (!doesGrantMatchScope(permit, executionRequest)) {
    throw sakFailure('SAK_SCOPE_MISMATCH', 'Execution request parameters do not match signed permit scope.');
  }
  const grant = state.grants.get(permit.grantId);
  if (!grant) {
    throw sakFailure('SAK_DEFAULT_DENY', 'Underlying permission grant does not exist.');
  }
  if (isAnyPermitPrincipalRevoked(state, permit)) {
    throw sakFailure('SAK_PRINCIPAL_REVOKED', 'Principal associated with permit has been revoked.');
  }
  const validity = checkGrantValidity(state, grant, { ...executionRequest, nowMs });
  if (!validity.ok) {
    throw sakFailure(validity.code, validity.message);
  }
  return { permit, grant };
}

function evaluateAuthorization(state, request = {}) {
  const nowMs = Number.isFinite(request.nowMs) ? Number(request.nowMs) : Date.now();
  const principalIds = { agentId: request.agentId ?? null, actuatorId: request.actuatorId ?? null };
  const preCheck = evaluatePreChecks(state, request);
  if (!preCheck.ok) {
    return denyDecision(state.authLog, {
      reasonCode: preCheck.code,
      message: preCheck.message,
      nowMs,
      principalIds,
      target: request.target,
      operation: request.operation,
      grantId: request.grantId
    });
  }
  const requestContext = {
    agentId: preCheck.agent.id,
    actuatorId: preCheck.actuator.id,
    target: String(request.target ?? ''),
    operation: String(request.operation ?? ''),
    grantId: request.grantId ?? null,
    nowMs
  };
  const grant = selectCandidateGrant(state, requestContext);
  if (!grant) {
    return denyDecision(state.authLog, {
      reasonCode: 'SAK_DEFAULT_DENY',
      message: 'Default-deny policy: no explicit permission grant matches request.',
      nowMs,
      principalIds,
      target: requestContext.target,
      operation: requestContext.operation
    });
  }
  const validity = checkGrantValidity(state, grant, requestContext);
  if (!validity.ok) {
    return denyDecision(state.authLog, {
      reasonCode: validity.code,
      message: validity.message,
      nowMs,
      principalIds,
      target: requestContext.target,
      operation: requestContext.operation,
      grantId: grant.grantId
    });
  }
  const permit = buildExecutionPermit(grant, requestContext, state.secret);
  const auditEntry = state.authLog.append({
    eventType: 'authorization_evaluated',
    decision: 'allow',
    reasonCode: 'SAK_AUTHORIZED',
    timestampMs: nowMs,
    principalIds: { operatorId: grant.operatorId, agentId: grant.agentId, actuatorId: grant.actuatorId },
    target: grant.target,
    operation: grant.operation,
    grantId: grant.grantId,
    details: { permitId: permit.permitId, expiresAtMs: grant.expiresAtMs }
  });
  return Object.freeze({
    allowed: true,
    decision: 'allow',
    reasonCode: 'SAK_AUTHORIZED',
    permit,
    auditEntry
  });
}

function invokeActuatorHandler(actuatorHandler, permit) {
  if (typeof actuatorHandler !== 'function') {
    return { status: 'executed' };
  }
  return actuatorHandler({
    target: permit.target,
    operation: permit.operation,
    actuatorId: permit.actuatorId,
    permitId: permit.permitId
  });
}

function runActuatorWithPermit(state, executionRequest = {}, actuatorHandler) {
  const nowMs = Number.isFinite(executionRequest.nowMs) ? Number(executionRequest.nowMs) : Date.now();
  try {
    assertInstructionSeparation(executionRequest);
    const { permit, grant } = validatePermitForExecution(state, executionRequest, nowMs);
    const output = invokeActuatorHandler(actuatorHandler, permit);
    const auditEntry = state.authLog.append({
      eventType: 'actuator_executed',
      decision: 'allow',
      reasonCode: 'SAK_ACTUATOR_EXECUTED',
      timestampMs: nowMs,
      principalIds: { operatorId: grant.operatorId, agentId: grant.agentId, actuatorId: grant.actuatorId },
      target: permit.target,
      operation: permit.operation,
      grantId: grant.grantId,
      details: { permitId: permit.permitId, outputDigest: fingerprint(output ?? {}) }
    });
    return Object.freeze({ executed: true, permitId: permit.permitId, output, auditEntry });
  } catch (err) {
    state.authLog.append({
      eventType: 'actuator_execution_blocked',
      decision: 'deny',
      reasonCode: err.code ?? 'SAK_EXECUTION_DENIED',
      timestampMs: nowMs,
      principalIds: {
        agentId: executionRequest?.agentId ?? null,
        actuatorId: executionRequest?.actuatorId ?? null
      },
      target: executionRequest?.target ?? null,
      operation: executionRequest?.operation ?? null,
      grantId: executionRequest?.permit?.grantId ?? null,
      details: { errorMessage: err.message }
    });
    throw err;
  }
}

module.exports = {
  evaluateAuthorization,
  runActuatorWithPermit
};
