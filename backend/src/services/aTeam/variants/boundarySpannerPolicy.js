'use strict';

const { validateSchema } = require('./variantExecutionService');

function boundarySpannerFullPotential(mission, boundaries, members) {
  const supplied = Array.isArray(mission.interfaceContracts) ? mission.interfaceContracts : [];
  const contracts = boundaries.interfaces.map((boundary) => buildContractWithValidation(boundary, supplied, members));

  return {
    semantic_contract_models: {
      contracts,
      contractVersioning: true,
      sourceProvenanceRequired: true
    },
    translation_schemas: {
      enabled: true,
      schemas: contracts.map((c) => c.translationSchema),
      transformationRulesTracked: true
    },
    compatibility_tests: {
      required: true,
      dualValidation: true,
      fromDomainValidation: true,
      toDomainValidation: true,
      automatedCompatibilityChecks: true
    },
    transformation_provenance: {
      tracked: true,
      fields: ['input', 'output', 'transformationApplied', 'validatedBy', 'timestamp'],
      immutableLog: true
    },
    semantic_drift_detection: {
      enabled: true,
      threshold: 0.15,
      checkInterval: 3600000,
      driftAlerting: true,
      automaticContractRevalidation: mission.autoRevalidate !== false
    },
    dual_domain_validation: {
      bothDomainsMustValidate: true,
      senderValidation: true,
      receiverValidation: true,
      validationBeforeTransfer: true
    }
  };
}

function buildContractWithValidation(boundary, supplied, members) {
  const found = findInterfaceContract(boundary, supplied);
  if (!found) throw new Error(`Boundary ${boundary.from} → ${boundary.to} requires a semantic interface contract.`);

  validateSemanticContract(found, boundary);
  validateEndpointSchemas(found, boundary, members);

  const translationSchema = resolveTranslationSchema(found);
  return {
    ...found,
    boundaryId: boundary.id,
    provenanceRequired: true,
    compatibilityChecksRequired: true,
    dualValidationRequired: true,
    translationSchema,
    semanticDriftDetection: {
      enabled: true,
      threshold: found.driftThreshold || 0.15,
      checkInterval: found.driftCheckInterval || 3600000,
      lastCheck: null
    },
    provenanceRecord: { transformations: [], validations: { fromDomain: null, toDomain: null } },
    transformationProvenance: {
      enabled: true,
      trackedFields: ['input', 'output', 'transformationRules', 'validationRules'],
      auditTrail: true
    }
  };
}

function findInterfaceContract(boundary, supplied) {
  return supplied.find(
    (c) => c.fromDomain === boundary.from && c.toDomain === boundary.to
  );
}

function resolveTranslationSchema(found) {
  if (found.translationSchema) return found.translationSchema;
  return {
    inputFormat: found.inputFormat,
    outputFormat: found.outputFormat,
    transformationRules: found.transformationRules || [],
    validationRules: found.validationRules || []
  };
}

function validateSemanticContract(contract, boundary) {
  const hasContractId = Boolean(contract.contractId);
  const hasVersion = Number.isInteger(contract.version);
  const hasProvenance = Boolean(contract.provenance?.sourceRefs?.length);

  if (!hasContractId || !hasVersion || !hasProvenance) {
    throw new Error(`Boundary ${boundary.id} requires a versioned contract and source provenance.`);
  }

  const schema = contract.semanticSchema || contract.translationSchema?.outputSchema;
  if (!schema || validateSchema(schema).length) {
    throw new Error(`Boundary ${boundary.id} requires a valid semantic schema.`);
  }

  const translation = contract.translationSchema;
  if (translation && (!Array.isArray(translation.transformationRules) || !translation.transformationRules.length)) {
    throw new Error(`Boundary ${boundary.id} translation requires explicit transformation rules.`);
  }
}

function validateEndpointSchemas(contract, boundary, members) {
  const source = findMemberSchema(members, boundary.from, 'outputSchema');
  const target = findMemberSchema(members, boundary.to, 'inputSchema');

  if (checkSchemaDrift(source, target, contract)) {
    throw new Error(`Boundary ${boundary.id} schemas drifted from the versioned contract.`);
  }
  if (!canTranslate(source, target, contract)) {
    throw new Error(`Boundary ${boundary.id} needs translation rules for incompatible endpoint schemas.`);
  }
}

function findMemberSchema(members, domain, schemaField) {
  const member = members.find((m) => (m.domain || m.subSystem || m.role) === domain);
  return member ? member[schemaField] : null;
}

function checkSchemaDrift(source, target, contract) {
  if (!source || !target) return false;
  const producerSchema = contract.producerSchema;
  const consumerSchema = contract.consumerSchema;
  const sourceDrift = Boolean(producerSchema && JSON.stringify(source) !== JSON.stringify(producerSchema));
  const targetDrift = Boolean(consumerSchema && JSON.stringify(target) !== JSON.stringify(consumerSchema));
  return sourceDrift || targetDrift;
}

function canTranslate(source, target, contract) {
  if (!source || !target) return true;
  if (contract.translationSchema) return true;
  return JSON.stringify(source) === JSON.stringify(target);
}

module.exports = { boundarySpannerFullPotential };
