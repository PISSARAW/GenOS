'use strict';

const policies = require('./agow/agowMechanismPolicyService');
const { hash, error, sameScope } = require('./gvxContracts');
const lease = require('./gvxRuntimeLease');

function createRuntime(options) {
  return { apply: (change) => apply(options, change), rollback: (id) => rollback(options, id),
    currentHash: async () => hash(await policies.load({ db: options.db, agentId: options.agentId })) };
}

async function readOperation(options, id) {
  await lease.initialize(options.db);
  const row = await options.db.get('SELECT * FROM gvx_runtime_operations WHERE id = ?', id);
  if (!row) return null;
  const scope = { organizationId: row.organization_id, projectId: row.project_id, entityId: row.entity_id };
  if (!sameScope(scope, options.scope) || row.agent_id !== options.agentId) throw error('GVX_RUNTIME_OPERATION_SCOPE_MISMATCH');
  return { ...JSON.parse(row.payload_json), status: row.status };
}

async function apply(options, change) {
  validateChange(change);
  const receipt = { beforeHash: hash(change.parentPolicy), afterHash: hash(change.candidatePolicy),
    rollbackToken: change.applicationId, parentPolicy: change.parentPolicy, candidatePolicy: change.candidatePolicy };
  let prior = await readOperation(options, change.applicationId);
  if (prior && hash({ ...prior, status: undefined }) !== hash(receipt)) throw error('GVX_RUNTIME_OPERATION_CONFLICT');
  if (prior?.status === 'restored') throw error('GVX_RUNTIME_ALREADY_ROLLED_BACK');
  if (!prior) {
    await options.db.run(`INSERT OR IGNORE INTO gvx_runtime_operations
      (id, organization_id, project_id, entity_id, agent_id, payload_json, status) VALUES (?, ?, ?, ?, ?, ?, 'prepared')`,
    change.applicationId, options.scope.organizationId, options.scope.projectId, options.scope.entityId,
    options.agentId, JSON.stringify(receipt));
    prior = await readOperation(options, change.applicationId);
    if (hash({ ...prior, status: undefined }) !== hash(receipt)) throw error('GVX_RUNTIME_OPERATION_CONFLICT');
  }
  const current = hash(await policies.load({ db: options.db, agentId: options.agentId }));
  if (![receipt.beforeHash, receipt.afterHash].includes(current)) throw error('GVX_RUNTIME_PARENT_MISMATCH');
  if (current === receipt.beforeHash) await changePolicy(options, { from: receipt.parentPolicy, to: receipt.candidatePolicy });
  await setStatus(options.db, change.applicationId, 'applied');
  return receipt;
}

async function rollback(options, id) {
  const receipt = await readOperation(options, id);
  if (!receipt) throw error('GVX_RUNTIME_OPERATION_NOT_FOUND');
  const current = hash(await policies.load({ db: options.db, agentId: options.agentId }));
  if (![receipt.beforeHash, receipt.afterHash].includes(current)) throw error('GVX_RUNTIME_ROLLBACK_CONFLICT');
  if (current === receipt.afterHash) await changePolicy(options, { from: receipt.candidatePolicy, to: receipt.parentPolicy });
  await setStatus(options.db, id, 'restored');
  return { restoredHash: receipt.beforeHash };
}

function validateChange(change) {
  if (!change?.applicationId || !policies.validPolicy(change.parentPolicy) || !policies.validPolicy(change.candidatePolicy)) {
    throw error('GVX_RUNTIME_POLICY_CHANGE_INVALID');
  }
  if (!Object.keys(policies.DEFAULT_POLICY).every((key) => change.parentPolicy[key] && change.candidatePolicy[key])) {
    throw error('GVX_RUNTIME_COMPLETE_POLICY_REQUIRED');
  }
}

async function setStatus(db, id, status) {
  await db.run("UPDATE gvx_runtime_operations SET status = ?, updated_at = datetime('now') WHERE id = ?", status, id);
}

module.exports = { createRuntime, readOperation };

async function changePolicy(options, change) {
  await require('./agow/agowStatePersistenceService').update({ db: options.db,
    agentId: options.agentId, scope: 'agow_mechanism_policy' }, (stored) => {
    const current = hash({ ...policies.DEFAULT_POLICY, ...stored });
    if (![hash(change.from), hash(change.to)].includes(current)) throw error('GVX_RUNTIME_POLICY_CONTENTION');
    return change.to;
  });
}
