'use strict';

const POLICY_VERSION = 'planning-gap-transition/v1';
const TASK_SIGNATURE_VERSION = 'planning-gap-task/v1';
const ORACLE_EVIDENCE_PREFIX = 'planning-gap-oracle/v1:';
const COST_DOMINANCE_CONDITION = 'oracle-cost-dominated/v1';
const MIN_CONFIDENCE = 0.8;

function transitionStatement(spec) {
  return [POLICY_VERSION, encodeURIComponent(spec.taskId),
    encodeURIComponent(spec.stateKey), encodeURIComponent(spec.action)].join('|');
}

function taskSignature(taskId) {
  return `${TASK_SIGNATURE_VERSION}:${taskId}`;
}

function hasVerifiedDominanceTrail(spec) {
  if (!spec.memory || !spec.agentId || !spec.taskId || !spec.stateKey || !spec.action) return false;
  const identity = transitionStatement(spec);
  return spec.memory.getActiveTrails(spec.agentId)
    .some(trail => matchesTrail({ trail, taskId: spec.taskId, identity }));
}

function matchesTrail(spec) {
  const { trail, identity } = spec;
  return trail.statement === identity && trail.environment === taskSignature(spec.taskId) &&
    trail.scope === 'task' && Array.isArray(trail.conditions) &&
    trail.conditions.includes(COST_DOMINANCE_CONDITION) &&
    typeof trail.evidence === 'string' && trail.evidence.startsWith(ORACLE_EVIDENCE_PREFIX) &&
    trail.confidence >= MIN_CONFIDENCE;
}

module.exports = {
  POLICY_VERSION,
  TASK_SIGNATURE_VERSION,
  ORACLE_EVIDENCE_PREFIX,
  COST_DOMINANCE_CONDITION,
  transitionStatement,
  taskSignature,
  hasVerifiedDominanceTrail,
};
