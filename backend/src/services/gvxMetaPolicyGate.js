'use strict';

const { appendEvent } = require('./gvxDevelopmentLedger');

const PROTECTED_SURFACES = Object.freeze([
  'root_authority', 'sandbox_boundary', 'proof_verifier', 'hidden_evaluations',
  'ledger_signing', 'promotion_authority', 'hard_resource_limits', 'constitutional_policies'
]);

function validateChange(input) {
  if (!input || typeof input !== 'object') return ['meta-change-object-required'];
  return [
    ...scopeErrors(input), ...plasticityErrors(input), ...controlErrors(input),
    ...suiteErrors(input), ...identityErrors(input)
  ];
}

function scopeErrors(input) {
  return input.scope && input.scope.organizationId && input.scope.projectId && input.entityId
    ? [] : ['meta-change-scope-required'];
}

function plasticityErrors(input) {
  if (input.plasticity !== 'P9') return ['meta-policy-must-use-p9'];
  return PROTECTED_SURFACES.includes(input.surface) ? ['protected-surface-immutable'] : [];
}

function controlErrors(input) {
  const keys = ['sandbox', 'verifier', 'hiddenEvaluation', 'authority'];
  return input.controlHashes && keys.every((key) => input.controlHashes[key])
    ? [] : ['trusted-control-hashes-required'];
}

function suiteErrors(input) {
  return Array.isArray(input.tasks) && Number.isInteger(input.minTasks) && input.minTasks >= 2
    ? [] : ['longitudinal-suite-required'];
}

function identityErrors(input) {
  return validIdentity(input) ? [] : ['meta-change-identity-required'];
}

function validIdentity(input) {
  return typeof input.policyId === 'string' && Boolean(input.policyId.trim())
    && /^[a-f0-9]{64}$/.test(input.parentHash || '')
    && /^[a-f0-9]{64}$/.test(input.candidateHash || '')
    && /^[a-f0-9]{64}$/.test(input.heldOutSuiteHash || '');
}

function assessTasks(input) {
  const tasks = input.tasks || [];
  const unique = new Set(tasks.map((task) => task.taskId));
  const valid = tasks.length >= input.minTasks && unique.size === tasks.length && tasks.every(validTask);
  const regressed = tasks.some((task) => task.regressed === true);
  return { valid, regressed, taskCount: tasks.length };
}

function validTask(task) {
  return Boolean(task && typeof task.taskId === 'string' && task.taskId.trim()
    && task.status === 'completed' && /^[a-f0-9]{64}$/.test(task.artifactHash || '')
    && task.regressed !== null && typeof task.regressed === 'boolean');
}

function assessMetaPolicyChange(input) {
  const errors = validateChange(input);
  if (errors.length) throw Object.assign(new Error(errors.join(',')), { code: 'GVX_META_CHANGE_INVALID', errors });
  const tasks = assessTasks(input);
  return {
    policyId: input.policyId,
    status: !tasks.valid ? 'inconclusive' : tasks.regressed ? 'reject' : 'ready_for_external_review',
    promotionAllowed: false,
    controlHashes: { ...input.controlHashes },
    heldOutSuiteHash: input.heldOutSuiteHash,
    taskCount: tasks.taskCount,
    evidence: input.tasks.map((task) => ({ taskId: task.taskId, artifactHash: task.artifactHash }))
  };
}

async function recordMetaAssessment(db, input) {
  const assessment = assessMetaPolicyChange(input);
  return appendEvent(db, {
    organizationId: input.scope.organizationId, projectId: input.scope.projectId,
    entityId: input.entityId, type: 'decision_recorded', parentHash: input.parentHash,
    candidateHash: input.candidateHash, payload: { kind: 'meta_policy_assessment', assessment }
  });
}

module.exports = { PROTECTED_SURFACES, validateChange, assessMetaPolicyChange, recordMetaAssessment };
