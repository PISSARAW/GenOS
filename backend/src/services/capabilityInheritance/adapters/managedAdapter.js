'use strict';

const { randomUUID } = require('node:crypto');
const dbStore = require('../../../db');
const { deriveDelegation } = require('../../ontogenesis/asyncDelegationPlanService');
const {
  lockedCapability, assertAuthority, assertNoRevocation, assertDescriptor,
  adapterError
} = require('./adapterContract');

async function delegateManagedCapability(input) {
  const installation = await loadInstallation(input);
  const scoped = { ...input, lockfile: JSON.parse(installation.lockfile_json), mode: 'managed' };
  const capability = lockedCapability(scoped);
  const descriptor = await loadDescriptor(input.db, capability);
  assertDescriptor({ descriptor, capability, mode: 'managed' });
  await assertAuthority({ ...scoped, capability });
  await assertNoRevocation({ ...scoped, capability, scope: { organizationId: input.organizationId,
    projectId: input.projectId }, isRevoked: revocationLookup(input.db), visited: new Set() });
  const delegation = await deriveDelegation(input.db, delegationInput(input, capability));
  const receipt = delegationReceipt(input, capability, delegation);
  await persistDelegationReceipt(input, receipt);
  return { delegation, receipt };
}

async function loadInstallation(input) {
  const project = await input.db.get("SELECT id FROM projects WHERE id = ? AND organization_id = ? AND status = 'active'",
    [input.projectId, input.organizationId]);
  if (!project) throw adapterError('GCI_PROJECT_SCOPE_DENIED');
  const row = await input.db.get(`SELECT lockfile_json, status FROM gci_installations
    WHERE organization_id = ? AND project_id = ? AND environment = ?`,
  [input.organizationId, input.projectId, input.environment]);
  if (!row || row.status !== 'active') throw adapterError('GCI_INSTALLATION_INACTIVE');
  return row;
}

async function loadDescriptor(db, capability) {
  const row = await db.get(`SELECT descriptor_json FROM gci_capability_exports
    WHERE capability_id = ? AND version = ? AND status = 'active'`,
  [capability.capabilityId, capability.version]);
  if (!row) throw adapterError('GCI_CAPABILITY_REVOKED');
  return JSON.parse(row.descriptor_json);
}

function delegationInput(input, capability) {
  const operationId = required(input.operationId, 'GCI_OPERATION_ID_REQUIRED');
  return { missionId: `gci:${input.projectId}:${operationId}`,
    projectId: required(input.ontogenesisProjectId, 'GCI_ONTOGENESIS_PROJECT_REQUIRED'),
    producerId: required(input.producerId, 'GCI_PRODUCER_REQUIRED'),
    capsulePath: required(input.capsulePath, 'GCI_CAPSULE_REQUIRED'),
    baseRevision: required(input.baseRevision, 'GCI_BASE_REVISION_REQUIRED') };
}

function revocationLookup(db) {
  return async (scope) => db.get(`SELECT 1 FROM gci_project_revocations
    WHERE organization_id = ? AND project_id = ? AND capability_id = ? AND version = ?`,
  [scope.organizationId, scope.projectId, scope.capabilityId, scope.version]);
}

function delegationReceipt(input, capability, delegation) {
  return Object.freeze({ schema: 'genos.gci.managed-delegation-receipt/v1', id: randomUUID(),
    organizationId: input.organizationId, projectId: input.projectId, environment: input.environment,
    capabilityId: capability.capabilityId, version: capability.version, mode: 'managed',
    implementationDigest: capability.implementationDigest, authority: capability.effectiveAuthority,
    delegationId: delegation.id, planHash: delegation.plan_hash, outcome: 'delegated',
    eventType: 'managed_delegation_proposed' });
}

async function persistDelegationReceipt(input, receipt) {
  const id = randomUUID();
  await dbStore.withTransaction(input.db, (tx) => tx.run(`INSERT INTO gci_event_ledger
    (id, organization_id, project_id, event_type, event_json) VALUES (?, ?, ?, ?, ?)`,
  [id, input.organizationId, input.projectId, receipt.eventType, JSON.stringify(receipt)]));
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw adapterError(code);
  return value.trim();
}

module.exports = { delegateManagedCapability };
