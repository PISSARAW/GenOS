'use strict';

const { validateActions } = require('./stateMigrationPlan');

const PATCH_OPERATIONS = Object.freeze([
  'SPAWN_NODE', 'RETIRE_NODE', 'NEST', 'UNNEST', 'SPLIT', 'MERGE', 'WRAP', 'UNWRAP',
  'BRIDGE', 'UNBRIDGE', 'MIGRATE_WORKER', 'MIGRATE_STATE', 'CHANGE_VARIANT',
  'CHANGE_PARAMETERS', 'CHANGE_COMMUNICATION', 'FREEZE', 'THAW', 'PROMOTE', 'DEMOTE'
]);

function hasStructuralOperation(operations) {
  const nonStructural = ['CHANGE_COMMUNICATION', 'CHANGE_PARAMETERS'];
  return operations.some((operation) => operation && !nonStructural.includes(operation.type));
}

function validateMorphologyPatch(patch) {
  if (!patch || typeof patch !== 'object') return { valid: false, errors: ['patch is required'] };
  const errors = [
    ...versionErrors(patch), ...operationErrors(patch), ...migrationPlanErrors(patch),
    ...metadataErrors(patch), ...rollbackErrors(patch)
  ];
  return { valid: errors.length === 0, errors };
}

function versionErrors(patch) {
  return !Number.isInteger(patch.baseGraphVersion) || patch.baseGraphVersion < 1
    ? ['baseGraphVersion must be a positive integer'] : [];
}

function operationErrors(patch) {
  const operations = Array.isArray(patch.operations) ? patch.operations : [];
  if (operations.length === 0) return ['patch must contain operations'];
  return operations.some((operation) => !operation || !PATCH_OPERATIONS.includes(operation.type))
    ? ['patch contains an unsupported operation'] : [];
}

function migrationPlanErrors(patch) {
  const operations = Array.isArray(patch.operations) ? patch.operations : [];
  return hasStructuralOperation(operations) ? migrationErrors(patch.stateMigrationPlan) : [];
}

function metadataErrors(patch) {
  return patch.reason && Array.isArray(patch.evidence) ? [] : ['patch reason and evidence are required'];
}

function rollbackErrors(patch) {
  const restoreDomains = patch.rollbackPlan && patch.rollbackPlan.restoreDomains;
  const requiredDomains = ['graph', 'workers', 'leases', 'state', 'budgets'];
  return !Array.isArray(restoreDomains) || requiredDomains.some((domain) => !restoreDomains.includes(domain))
    ? ['rollback plan must restore graph, workers, leases, state and budgets'] : [];
}

function migrationErrors(plan) {
  if (!plan) return ['structural patch requires a state migration plan'];
  return validateActions(plan);
}

function buildPatch(input) {
  return {
    patchId: input.patchId || null,
    baseGraphVersion: input.baseGraphVersion,
    operations: Array.isArray(input.operations) ? input.operations.map((operation) => ({ ...operation })) : [],
    reason: input.reason || '',
    evidence: Array.isArray(input.evidence) ? [...input.evidence] : [],
    expectedGain: input.expectedGain || {},
    expectedCost: input.expectedCost || {},
    stateMigrationPlan: input.stateMigrationPlan || null,
    rollbackPlan: input.rollbackPlan || null
  };
}

function createMorphologyPatch(input = {}) {
  const patch = buildPatch(input);
  const validation = validateMorphologyPatch(patch);
  if (!validation.valid) throw new Error(`Invalid morphology patch: ${validation.errors.join('; ')}`);
  return patch;
}

module.exports = { PATCH_OPERATIONS, createMorphologyPatch, validateMorphologyPatch };
