'use strict';

const { createHash, randomUUID } = require('node:crypto');
const Ajv = require('ajv');
const dbStore = require('../../../db');

async function invokeLinkedCapability(input) {
  const { db, organizationId, projectId, environment, capabilityId, args, getProjectAuthority, handlers } = input;
  const project = await db.get("SELECT id FROM projects WHERE id = ? AND organization_id = ? AND status = 'active'", [projectId, organizationId]);
  if (!project) throw invocationError('GCI_PROJECT_SCOPE_DENIED', projectId);
  const installation = await db.get(`SELECT lockfile_json, status FROM gci_installations
    WHERE organization_id = ? AND project_id = ? AND environment = ?`, [organizationId, projectId, environment]);
  assertActiveInstallation(installation);
  const lockfile = JSON.parse(installation.lockfile_json);
  const capability = lockfile.capabilities.find((entry) => entry.capabilityId === capabilityId);
  if (!capability || capability.mode !== 'linked') throw invocationError('GCI_CAPABILITY_NOT_LINKED', capabilityId);
  const exported = await db.get(`SELECT descriptor_json FROM gci_capability_exports
    WHERE capability_id = ? AND version = ? AND status = 'active'`, [capabilityId, capability.version]);
  if (!exported) throw invocationError('GCI_CAPABILITY_REVOKED', capabilityId);
  const descriptor = JSON.parse(exported.descriptor_json);
  if (descriptor.implementationDigest !== capability.implementationDigest) throw invocationError('GCI_ARTIFACT_CHANGED', capabilityId);
  validateContract(descriptor.inputContract, args, 'GCI_INPUT_INVALID');
  const authority = await getProjectAuthority({ organizationId, projectId });
  if (!Array.isArray(authority)) throw invocationError('GCI_AUTHORITY_UNAVAILABLE', capabilityId);
  if (capability.effectiveAuthority.some((permission) => !authority.includes(permission))) throw invocationError('GCI_AUTHORITY_REVOKED', capabilityId);
  const handler = handlers[capabilityId];
  if (typeof handler !== 'function') throw invocationError('GCI_HANDLER_UNAVAILABLE', capabilityId);
  const result = await handler({ args, authority: capability.effectiveAuthority, projectId });
  validateContract(descriptor.outputContract, result, 'GCI_OUTPUT_INVALID');
  const receipt = createReceipt({ organizationId, projectId, environment, capability, result });
  await dbStore.withTransaction(db, (tx) => tx.run(`INSERT INTO gci_event_ledger
    (id, organization_id, project_id, event_type, event_json) VALUES (?, ?, ?, 'capability_invoked', ?)`,
  [receipt.id, organizationId, projectId, JSON.stringify(receipt)]));
  return { result, receipt };
}

function validateContract(schema, value, code) {
  let valid = false;
  try {
    const validator = new Ajv({ allErrors: true, strict: false }).compile(schema || {});
    valid = validator(value);
  } catch {
    throw invocationError('GCI_CONTRACT_INVALID');
  }
  if (!valid) throw invocationError(code);
}

function createReceipt({ organizationId, projectId, environment, capability, result }) {
  const body = { schema: 'genos.gci.invocation-receipt/v1', id: randomUUID(), organizationId, projectId,
    environment, capabilityId: capability.capabilityId, version: capability.version,
    implementationDigest: capability.implementationDigest, authority: capability.effectiveAuthority,
    resultDigest: `sha256:${createHash('sha256').update(JSON.stringify(result)).digest('hex')}`, outcome: 'completed' };
  return Object.freeze(body);
}

function assertActiveInstallation(installation) {
  if (!installation || installation.status !== 'active') throw invocationError('GCI_INSTALLATION_INACTIVE');
}

function invocationError(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

module.exports = { invokeLinkedCapability };
