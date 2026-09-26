'use strict';

const { validateActions } = require('./stateMigrationPlan');

const PATCH_OPERATIONS = Object.freeze([
  'ADD_NODE', 'REMOVE_NODE', 'REPLACE_NODE',
  'NEST', 'UNNEST', 'SPLIT', 'MERGE', 'MOVE_SUBTREE',
  'CHANGE_TOPOLOGY', 'CHANGE_VARIANT', 'RESIZE_POPULATION',
  'ADD_EDGE', 'REMOVE_EDGE', 'REWIRE',
  'ADD_BRIDGE', 'REMOVE_BRIDGE',
  'MIGRATE_WORKER', 'MIGRATE_STATE',
  'CHANGE_BUDGET', 'CHANGE_COMMUNICATION_POLICY', 'CHANGE_EVIDENCE_POLICY',
  'FREEZE', 'THAW', 'QUIESCE', 'PROMOTE', 'DEMOTE'
]);

const STRUCTURAL_OPS = new Set([
  'ADD_NODE', 'REMOVE_NODE', 'REPLACE_NODE', 'NEST', 'UNNEST',
  'SPLIT', 'MERGE', 'MOVE_SUBTREE', 'CHANGE_TOPOLOGY',
  'ADD_EDGE', 'REMOVE_EDGE', 'REWIRE', 'ADD_BRIDGE', 'REMOVE_BRIDGE',
  'MIGRATE_STATE'
]);

function hasStructuralOperation(operations) { return operations.some(op => op && STRUCTURAL_OPS.has(op.type)); }

function validateMorphologyPatch(patch) { if (!patch || typeof patch !== 'object') return { valid: false, errors: ['patch is required'] }; return { valid: !collectErrors(patch).length, errors: collectErrors(patch) }; }

function collectErrors(patch) { return [checkVersion(patch), checkOperations(patch), checkMigrationPlan(patch), checkMetadata(patch), checkRollback(patch), checkPreconditions(patch)].flat(); }

function checkVersion(patch) { return !Number.isInteger(patch.baseGraphVersion) || patch.baseGraphVersion < 1 ? ['baseGraphVersion must be a positive integer'] : []; }
function checkOperations(patch) { const ops = Array.isArray(patch.operations) ? patch.operations : []; return !ops.length ? ['patch must contain operations'] : ops.some(op => !op || !PATCH_OPERATIONS.includes(op.type)) ? ['patch contains an unsupported operation'] : []; }
function checkMigrationPlan(patch) { const ops = Array.isArray(patch.operations) ? patch.operations : []; return hasStructuralOperation(ops) ? migrationErrors(patch.stateMigrationPlan) : []; }
function checkMetadata(patch) { return patch.reason && Array.isArray(patch.evidence) ? [] : ['patch reason and evidence are required']; }
function checkRollback(patch) { const rd = patch.rollbackPlan?.restoreDomains; return !Array.isArray(rd) || ['graph','workers','leases','state','budgets'].some(d => !rd.includes(d)) ? ['rollback plan must restore graph, workers, leases, state and budgets'] : []; }
function checkPreconditions(patch) { const errors = []; for (const op of patch.operations || []) validateOpPreconditions(op, errors); return errors; }
function validateOpPreconditions(op, errors) { if (op.preconditions && !Array.isArray(op.preconditions)) errors.push(`Operation ${op.type} preconditions must be an array`); if (op.affectedScope && typeof op.affectedScope !== 'string') errors.push(`Operation ${op.type} affectedScope must be a string`); if (op.authority && typeof op.authority !== 'string') errors.push(`Operation ${op.type} authority must be a string`); if (op.lease && typeof op.lease !== 'string') errors.push(`Operation ${op.type} lease must be a string`); }
function migrationErrors(plan) { return !plan ? ['structural patch requires a state migration plan'] : validateActions(plan); }

function cloneOps(ops) { return Array.isArray(ops) ? ops.map(op => ({ ...op })) : []; }
function cloneArr(arr) { return Array.isArray(arr) ? [...arr] : []; }
function nullOr(obj, key) { return obj[key] || null; }
function objOr(obj, key) { return obj[key] || {}; }

function buildPatch(input) {
  return { patchId: input.patchId || null, baseGraphVersion: input.baseGraphVersion, operations: cloneOps(input.operations), reason: input.reason || '', evidence: cloneArr(input.evidence), expectedGain: objOr(input, 'expectedGain'), expectedCost: objOr(input, 'expectedCost'), stateMigrationPlan: nullOr(input, 'stateMigrationPlan'), rollbackPlan: nullOr(input, 'rollbackPlan'), authority: nullOr(input, 'authority'), lease: nullOr(input, 'lease') };
}

function createMorphologyPatch(input = {}) { const p = buildPatch(input); const v = validateMorphologyPatch(p); if (!v.valid) throw new Error(`Invalid morphology patch: ${v.errors.join('; ')}`); return p; }

function createOperation(type, payload = {}) { return { type, ...payload, timestamp: new Date().toISOString() }; }

module.exports = { PATCH_OPERATIONS, createMorphologyPatch, validateMorphologyPatch, createOperation, hasStructuralOperation };