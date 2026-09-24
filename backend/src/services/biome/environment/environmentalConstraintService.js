'use strict';

function evaluateConstraints(environment, requestedResources = {}) {
  const evaluations = getConstraints(environment).map((constraint) => evaluateConstraint(constraint, requestedResources));
  return {
    evaluations,
    blocked: hasStatus(evaluations, 'blocked'),
    exceeded: byStatus(evaluations, 'exceeded')
  };
}

function evaluateConstraint(constraint, requestedResources) {
  const key = String(constraint?.resource || '').trim();
  const limit = Number(constraint?.maximum);
  if (!validLimit(key, limit)) return unmeasurable(constraint);
  const requested = Number(requestedResources[key]);
  if (!validRequest(requested)) return { ...unmeasurable(constraint), resource: key, maximum: limit };
  return {
    constraintId: constraint.id || null,
    resource: key,
    requested,
    maximum: limit,
    status: limitStatus(constraint, requested, limit)
  };
}

function getConstraints(environment) {
  return Array.isArray(environment?.constraints) ? environment.constraints : [];
}

function hasStatus(items, status) {
  return items.some((item) => item.status === status);
}

function byStatus(items, status) {
  return items.filter((item) => item.status === status);
}

function validLimit(key, limit) {
  return Boolean(key) && Number.isFinite(limit) && limit >= 0;
}

function validRequest(requested) {
  return Number.isFinite(requested) && requested >= 0;
}

function unmeasurable(constraint) {
  return { constraintId: constraint?.id || null, status: 'unmeasurable', reason: 'Constraint lacks a measurable resource bound.' };
}

function limitStatus(constraint, requested, limit) {
  if (requested <= limit) return 'satisfied';
  return constraint.blocking === true ? 'blocked' : 'exceeded';
}

module.exports = { evaluateConstraints };
