'use strict';

const {
  GRANT_SCHEMA,
  PERMIT_SCHEMA,
  PRINCIPAL_KINDS,
  MAX_GRANT_DURATION_MS,
  ALLOWED_SECURITY_OPERATIONS,
  MODEL_BYPASS_FLAGS,
  sakFailure,
  requiredText,
  assertNoWildcard,
  hmacHex,
  fingerprint
} = require('./sakPrimitives');

function stripPrincipalPrefix(id) {
  return String(id).replace(/^(?:agent|operator|actuator):/i, '').trim();
}

function validatePrincipalRegistration(principal = {}) {
  const id = requiredText(principal.id, 'SAK_PRINCIPAL_ID_REQUIRED', 128);
  const kind = requiredText(principal.kind, 'SAK_PRINCIPAL_KIND_REQUIRED', 32).toLowerCase();
  if (!PRINCIPAL_KINDS.includes(kind)) {
    throw sakFailure('SAK_PRINCIPAL_KIND_INVALID', `Unsupported principal kind: ${kind}`);
  }
  const rawId = requiredText(stripPrincipalPrefix(id), 'SAK_PRINCIPAL_ID_REQUIRED', 128);
  const normalizedId = `${kind}:${rawId}`;
  return Object.freeze({
    id: normalizedId,
    rawId,
    kind,
    label: requiredText(principal.label || normalizedId, 'SAK_PRINCIPAL_LABEL_REQUIRED', 128),
    capabilities: Object.freeze(Array.isArray(principal.capabilities) ? principal.capabilities.slice() : []),
    registeredAtMs: Number.isFinite(principal.registeredAtMs) ? Number(principal.registeredAtMs) : Date.now()
  });
}

function assertExpectedPrincipalKind(registry, principalId, expectedKind) {
  const record = registry.get(principalId);
  if (!record) {
    throw sakFailure('SAK_PRINCIPAL_UNKNOWN', `Unregistered principal: ${principalId}`);
  }
  if (record.kind !== expectedKind) {
    throw sakFailure(
      'SAK_PRINCIPAL_ROLE_MISMATCH',
      `Principal ${principalId} has kind ${record.kind}, expected ${expectedKind}`
    );
  }
  return record;
}

function validateGrantScope(spec = {}) {
  const target = assertNoWildcard(spec.target, 'SAK_TARGET_INVALID');
  const operation = assertNoWildcard(spec.operation, 'SAK_OPERATION_INVALID');
  if (!ALLOWED_SECURITY_OPERATIONS.includes(operation)) {
    throw sakFailure('SAK_OPERATION_FORBIDDEN', `Operation not in security catalog: ${operation}`);
  }
  const issuedAtMs = Number.isFinite(spec.issuedAtMs) ? Number(spec.issuedAtMs) : Date.now();
  const durationMs = Number(spec.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_GRANT_DURATION_MS) {
    throw sakFailure('SAK_DURATION_INVALID', `Invalid permission durationMs: ${spec.durationMs}`);
  }
  return {
    target,
    operation,
    issuedAtMs,
    durationMs,
    expiresAtMs: issuedAtMs + durationMs
  };
}

function buildPermissionGrant(principals, scope, metadata = {}) {
  const body = {
    schema: GRANT_SCHEMA,
    operatorId: principals.operator.id,
    agentId: principals.agent.id,
    actuatorId: principals.actuator.id,
    target: scope.target,
    operation: scope.operation,
    issuedAtMs: scope.issuedAtMs,
    durationMs: scope.durationMs,
    expiresAtMs: scope.expiresAtMs,
    ticketRef: requiredText(metadata.ticketRef || 'sec-mandate-default', 'SAK_TICKET_REQUIRED', 128),
    justification: requiredText(metadata.justification || 'Scoped security operation', 'SAK_JUSTIFICATION_REQUIRED', 512)
  };
  const grantId = `grant:${fingerprint(body).slice(0, 24)}`;
  return Object.freeze({ ...body, grantId });
}

function detectModelBypassAttempt(request = {}) {
  for (const flag of MODEL_BYPASS_FLAGS) {
    if (Boolean(request[flag]) || Boolean(request.context?.[flag])) {
      return flag;
    }
  }
  return null;
}

function buildExecutionPermit(grant, requestContext, secret) {
  const body = {
    schema: PERMIT_SCHEMA,
    grantId: grant.grantId,
    operatorId: grant.operatorId,
    agentId: grant.agentId,
    actuatorId: grant.actuatorId,
    target: grant.target,
    operation: grant.operation,
    issuedAtMs: requestContext.nowMs,
    expiresAtMs: grant.expiresAtMs,
    requestHash: fingerprint({
      agentId: grant.agentId,
      actuatorId: grant.actuatorId,
      target: grant.target,
      operation: grant.operation,
      nowMs: requestContext.nowMs
    })
  };
  const permitId = `permit:${fingerprint(body).slice(0, 24)}`;
  const kernelSignature = hmacHex(secret, { ...body, permitId });
  return Object.freeze({ ...body, permitId, kernelSignature });
}

function verifyPermitSignature(permit, secret) {
  if (!permit || typeof permit !== 'object' || permit.schema !== PERMIT_SCHEMA) {
    return false;
  }
  const { kernelSignature, ...rest } = permit;
  const expected = hmacHex(secret, rest);
  return typeof kernelSignature === 'string' && kernelSignature === expected;
}

module.exports = {
  validatePrincipalRegistration,
  assertExpectedPrincipalKind,
  validateGrantScope,
  buildPermissionGrant,
  detectModelBypassAttempt,
  buildExecutionPermit,
  verifyPermitSignature
};
