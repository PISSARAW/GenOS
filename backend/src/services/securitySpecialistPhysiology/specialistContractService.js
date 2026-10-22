'use strict';

const workerKinds = require('../agents/workerKindService');
const enforcement = require('../agents/workerContractEnforcement');
const contractLease = require('../agents/workerContractLeaseService');
const leasePolicy = require('../toolLeasePolicy');
const capabilityMatrix = require('../capabilityAccessMatrix');
const { validateResponsibility } = require('../aTeam/contracts/responsibilityContract');
const { getSpecialistSpec, listSpecialistSpecs } = require('./specialistCatalog');

function physiologyError(code, message, details = {}) {
  return Object.assign(new Error(message || code), { code, ...details });
}

function buildSpecialistWorkerContract(spec, options = {}) {
  return workerKinds.buildWorkerContract(spec.workerKind, {
    parentAgentId: options.orchestratorId ?? 'security-orchestrator',
    prompt: `${spec.title} — Mandat: ${spec.mandate}`,
    scope: options.scope ?? `security:${spec.specialistId}`,
    specialtyNiche: spec.nicheDomain,
    nicheDomain: spec.nicheDomain,
    topologySessionId: options.topologySessionId ?? null,
    communicationRequired: true,
    writeLease: false,
  });
}

function deriveMinimalEffectiveLease(spec, workerContract) {
  const policyLease = leasePolicy.derivePolicyLease({
    executionMode: 'worker',
    role: spec.role,
    capabilities: spec.declaredCapabilities,
  });
  const restrictedByAllowList = leasePolicy.restrictProvidedLease(spec.minimalToolAllowList, policyLease);
  return contractLease.restrict(workerContract, restrictedByAllowList);
}

function verifyDeclaredCapabilities(specialistId, capabilities, effectiveLease) {
  const leaseSet = new Set(effectiveLease ?? []);
  const accessEntries = (capabilities ?? []).map((cap) => {
    const entry = capabilityMatrix.accessFor(String(cap ?? '').toUpperCase());
    if (entry.level !== capabilityMatrix.ACCESS_MCP_TOOL) {
      throw physiologyError(
        'SPECIALIST_CAPABILITY_NOT_ACCESSIBLE',
        `Specialist '${specialistId}' declares non-operational capability '${cap}'.`,
      );
    }
    const reachableTools = entry.tools.filter((tool) => leaseSet.has(tool));
    if (reachableTools.length === 0) {
      throw physiologyError(
        'SPECIALIST_CAPABILITY_NOT_ACCESSIBLE',
        `Specialist '${specialistId}' capability '${cap}' has no tool in its effective lease.`,
      );
    }
    return Object.freeze({
      ...entry,
      reachableTools: Object.freeze(reachableTools),
      actuallyAccessible: true,
    });
  });

  const readiness = capabilityMatrix.toolReadiness(effectiveLease);
  if (!readiness.ready) {
    throw physiologyError(
      'SPECIALIST_TOOLS_NOT_ROUTABLE',
      `Specialist '${specialistId}' effective lease has unroutable tools.`,
      readiness,
    );
  }
  return Object.freeze({
    verifiedCapabilities: Object.freeze(accessEntries),
    readiness: Object.freeze(readiness),
  });
}

function verifyDeclaredCapabilitiesReachable(spec, effectiveLease) {
  const leaseSet = new Set(effectiveLease);
  const audit = verifyDeclaredCapabilities(spec.specialistId, spec.declaredCapabilities, effectiveLease);
  for (const expectedTool of spec.minimalToolAllowList) {
    if (!leaseSet.has(expectedTool)) {
      throw physiologyError(
        'SPECIALIST_LEASE_MISMATCH',
        `Specialist '${spec.specialistId}' declared tool '${expectedTool}' is not reachable under its worker contract/policy.`,
      );
    }
  }
  return audit;
}

function assertMinimalAuthorityInvariants(spec, workerContract) {
  enforcement.assertRuntimeContract(workerContract, spec.workerKind);
  const auth = workerContract.authority;
  if (auth.write || auth.promote || auth.spawn || auth.delegate || auth.topology) {
    throw physiologyError(
      'SPECIALIST_EXCESSIVE_AUTHORITY',
      `Specialist '${spec.specialistId}' violates minimal-permission physiology (write/promote/spawn/delegate/topology must be false).`,
    );
  }
  const respValidation = validateResponsibility(spec.responsibility);
  if (!respValidation.valid) {
    throw physiologyError(
      'SPECIALIST_RESPONSIBILITY_INVALID',
      respValidation.errors.join(' '),
    );
  }
}

function instantiateSpecialistPhysiology(specialistId, options = {}) {
  const spec = getSpecialistSpec(specialistId);
  const workerContract = buildSpecialistWorkerContract(spec, options);
  assertMinimalAuthorityInvariants(spec, workerContract);
  const effectiveLease = deriveMinimalEffectiveLease(spec, workerContract);
  const capabilityAudit = verifyDeclaredCapabilitiesReachable(spec, effectiveLease);

  return Object.freeze({
    specialistId: spec.specialistId,
    title: spec.title,
    role: spec.role,
    workerKind: spec.workerKind,
    nicheDomain: spec.nicheDomain,
    mandate: spec.mandate,
    mandateScope: spec.mandateScope,
    minimalPermissions: Object.freeze({ ...workerContract.authority }),
    declaredCapabilities: spec.declaredCapabilities,
    verifiedCapabilities: capabilityAudit.verifiedCapabilities,
    effectiveToolLease: Object.freeze(effectiveLease),
    capabilityAudit,
    responsibility: spec.responsibility,
    workerContract: Object.freeze(workerContract),
    outputContract: spec.outputContract,
    pipelineStage: spec.pipelineStage,
    dependsOn: spec.dependsOn,
    consumes: spec.consumes,
    provides: spec.provides,
  });
}

function normalizeActionRequest(actionOrTool) {
  if (typeof actionOrTool === 'string') {
    const trimmed = actionOrTool.trim();
    return {
      action: trimmed,
      toolName: trimmed.startsWith('genos_') ? trimmed : '',
    };
  }
  return {
    action: String(actionOrTool?.action ?? '').trim(),
    toolName: String(actionOrTool?.toolName ?? '').trim().toLowerCase(),
  };
}

function assertActionAllowedForSpecialist(specialistId, actionOrTool, options = {}) {
  const instance = instantiateSpecialistPhysiology(specialistId, options);
  const { action, toolName } = normalizeActionRequest(actionOrTool);

  if (instance.mandateScope.forbiddenActions.includes(action)) {
    throw physiologyError(
      'SPECIALIST_FORBIDDEN_ACTION',
      `Action '${action}' is explicitly forbidden by '${instance.specialistId}' mandate.`,
    );
  }
  if (!toolName) {
    return Object.freeze({ allowed: true, specialistId: instance.specialistId, action });
  }
  if (!instance.effectiveToolLease.includes(toolName)) {
    throw physiologyError(
      'SPECIALIST_TOOL_NOT_IN_MINIMAL_LEASE',
      `Tool '${toolName}' is outside minimal tool lease of '${instance.specialistId}'.`,
    );
  }
  enforcement.assertWorkerToolAllowed(instance.workerContract, toolName);
  return Object.freeze({ allowed: true, specialistId: instance.specialistId, action, toolName });
}

function instantiateAllSpecialists(options = {}) {
  return listSpecialistSpecs().map((spec) => instantiateSpecialistPhysiology(spec.specialistId, options));
}

module.exports = {
  physiologyError,
  verifyDeclaredCapabilities,
  instantiateSpecialistPhysiology,
  instantiateAllSpecialists,
  assertActionAllowedForSpecialist,
};
