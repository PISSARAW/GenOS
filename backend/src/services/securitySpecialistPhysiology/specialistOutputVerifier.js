'use strict';

const { validateWorkerArtifact } = require('../agents/workerArtifactContract');
const { canonicalDigest } = require('../digitalEvidenceOrgan/deoContract');
const { getSpecialistSpec } = require('./specialistCatalog');
const { instantiateSpecialistPhysiology, physiologyError } = require('./specialistContractService');

function isNonEmptyArray(val) {
  return Array.isArray(val) && val.length > 0;
}

function isBoolean(val) {
  return typeof val === 'boolean';
}

function validateNetworkFindings(payload) {
  const f = payload?.networkFindings;
  const valid = Boolean(
    f
    && Array.isArray(f.exposedPorts)
    && Array.isArray(f.routingAnomalies)
    && isNonEmptyArray(f.pfsenseRulesChecked),
  );
  if (!valid) {
    throw physiologyError(
      'SPECIALIST_OUTPUT_DOMAIN_INVALID',
      'Network Analyst requires networkFindings.{exposedPorts, routingAnomalies, pfsenseRulesChecked}.',
    );
  }
}

function validateWindowsFindings(payload) {
  const f = payload?.windowsFindings;
  const valid = Boolean(
    f
    && isNonEmptyArray(f.adPrincipals)
    && isNonEmptyArray(f.gpoPostureFindings)
    && Array.isArray(f.aclViolations)
    && isNonEmptyArray(f.evtxEventIds),
  );
  if (!valid) {
    throw physiologyError(
      'SPECIALIST_OUTPUT_DOMAIN_INVALID',
      'Windows Analyst requires windowsFindings.{adPrincipals, gpoPostureFindings, aclViolations, evtxEventIds}.',
    );
  }
}

function validateForensicFindings(payload) {
  const f = payload?.forensicFindings;
  const valid = Boolean(
    f
    && isNonEmptyArray(f.timelineEvents)
    && isBoolean(f.integrityVerified)
    && isNonEmptyArray(f.correlationClusterIds),
  );
  if (!valid) {
    throw physiologyError(
      'SPECIALIST_OUTPUT_DOMAIN_INVALID',
      'Forensic Analyst requires forensicFindings.{timelineEvents, integrityVerified, correlationClusterIds}.',
    );
  }
}

function validateThreatQualification(payload) {
  const f = payload?.threatQualification;
  const valid = Boolean(
    f
    && isNonEmptyArray(f.hypotheses)
    && typeof f.severityQualification === 'string'
    && f.severityQualification.trim()
    && isNonEmptyArray(f.falsificationTests),
  );
  if (!valid) {
    throw physiologyError(
      'SPECIALIST_OUTPUT_DOMAIN_INVALID',
      'Threat Analyst requires threatQualification.{hypotheses, severityQualification, falsificationTests}.',
    );
  }
}

function validateRemediationPlan(payload) {
  const f = payload?.remediationPlan;
  const valid = Boolean(
    f
    && isNonEmptyArray(f.proposedActions)
    && isNonEmptyArray(f.dependencies)
    && isNonEmptyArray(f.consequences)
    && typeof f.rollbackStrategy === 'string'
    && f.rollbackStrategy.trim(),
  );
  if (!valid) {
    throw physiologyError(
      'SPECIALIST_OUTPUT_DOMAIN_INVALID',
      'Remediation Planner requires remediationPlan.{proposedActions, dependencies, consequences, rollbackStrategy}.',
    );
  }
}

function validateIndependentAuditReport(payload) {
  const f = payload?.auditReport;
  const validVerdict = ['accept', 'reject', 'unresolved'].includes(String(f?.independentVerdict ?? '').toLowerCase());
  const valid = Boolean(
    f
    && validVerdict
    && Array.isArray(f.preservedContradictions)
    && isNonEmptyArray(f.auditedSpecialists)
    && f.promotionEligible === false,
  );
  if (!valid) {
    throw physiologyError(
      'SPECIALIST_OUTPUT_DOMAIN_INVALID',
      'Independent Auditor requires auditReport.{independentVerdict, preservedContradictions, auditedSpecialists, promotionEligible: false}.',
    );
  }
}

const DOMAIN_VALIDATORS = Object.freeze({
  network_analyst: validateNetworkFindings,
  windows_analyst: validateWindowsFindings,
  forensic_analyst: validateForensicFindings,
  threat_analyst: validateThreatQualification,
  remediation_planner: validateRemediationPlan,
  independent_auditor: validateIndependentAuditReport,
});

function assertRequiredTopLevelFields(spec, outputPayload) {
  for (const field of spec.outputContract.requiredTopLevelFields) {
    if (outputPayload?.[field] === undefined || outputPayload?.[field] === null) {
      throw physiologyError(
        'SPECIALIST_OUTPUT_FIELD_MISSING',
        `Specialist '${spec.specialistId}' output is missing required field '${field}'.`,
      );
    }
  }
}

function verifySpecialistOutput(specialistId, outputPayload, options = {}) {
  const spec = getSpecialistSpec(specialistId);
  const instance = instantiateSpecialistPhysiology(specialistId, options);
  assertRequiredTopLevelFields(spec, outputPayload);

  if (outputPayload.promotionEligible === true || outputPayload.authorizesPromotion === true) {
    throw physiologyError(
      'SPECIALIST_SELF_PROMOTION_FORBIDDEN',
      `Specialist '${spec.specialistId}' cannot declare promotionEligible or authorizesPromotion.`,
    );
  }

  // Canonical GenOS worker artifact verification
  const dossier = { events: [{ evidenceReport: outputPayload }] };
  validateWorkerArtifact(dossier, {
    agentId: options.agentId ?? `agent:${spec.specialistId}`,
    workerContract: instance.workerContract,
  });

  // Domain-specific specialist output contract verification
  DOMAIN_VALIDATORS[spec.specialistId](outputPayload);

  const outputDigest = canonicalDigest({
    schemaId: spec.outputContract.schemaId,
    specialistId: spec.specialistId,
    outputPayload,
  });

  return Object.freeze({
    verified: true,
    specialistId: spec.specialistId,
    workerKind: spec.workerKind,
    schemaId: spec.outputContract.schemaId,
    outputDigest,
    promotionEligible: false,
  });
}

module.exports = {
  verifySpecialistOutput,
};
