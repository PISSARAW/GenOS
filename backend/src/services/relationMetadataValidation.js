'use strict';

const UNIT_FIELDS = ['familiarity', 'sharedHistory', 'authority', 'trustForDomain',
  'commonGroundEstimate', 'epistemicIndependence', 'errorCorrelation', 'disclosureLevel'];

function invalid(field) {
  throw Object.assign(new Error(`Invalid relation metadata: ${field}.`), { code: 'RELATION_METADATA_INVALID' });
}

function objectMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('object required');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid('plain object required');
}

function unit(value, field) {
  if (!Number.isFinite(value) || value < 0 || value > 1) invalid(field);
}

function validateClass(metadata, contract) {
  if (metadata.relationClass === undefined) return;
  const name = metadata.relationClass;
  if (typeof name !== 'string' || !contract.classes[name]?.types.has(contract.relationType)) invalid('relationClass');
  if (contract.relationClass && contract.relationClass !== name) invalid('conflicting relationClass');
}

function validateDomainTrust(value) {
  if (value === undefined) return;
  objectMetadata(value);
  for (const [domain, trust] of Object.entries(value)) {
    if (!domain.trim()) invalid('trustByDomain domain');
    unit(trust, 'trustByDomain');
  }
}

function validateOptionalText(metadata) {
  if (metadata.preferredDialect != null && typeof metadata.preferredDialect !== 'string') invalid('preferredDialect');
  if (metadata.lastInteraction == null) return;
  if (typeof metadata.lastInteraction !== 'string' || Number.isNaN(Date.parse(metadata.lastInteraction))) invalid('lastInteraction');
}

function validateRelationMetadata(metadata, contract) {
  objectMetadata(metadata);
  validateClass(metadata, contract);
  for (const field of UNIT_FIELDS) unit(metadata[field], field);
  if (!Number.isSafeInteger(metadata.interactionCount) || metadata.interactionCount < 0) invalid('interactionCount');
  validateDomainTrust(metadata.trustByDomain);
  validateOptionalText(metadata);
  return metadata;
}

module.exports = { objectMetadata, validateRelationMetadata };
