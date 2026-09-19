'use strict';

const { getDatabase } = require('../db');

const OPERATORS = new Set(['equals', 'notEquals', 'in', 'contains', 'exists', 'greaterThan', 'lessThan']);
const ATTRIBUTE_PATH = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/;
const CONDITION_MATCHERS = {
  equals: (actual, expected) => actual === expected,
  notEquals: (actual, expected) => actual !== expected,
  in: (actual, expected) => Array.isArray(expected) && expected.includes(actual),
  contains: (actual, expected) => Array.isArray(actual) ? actual.includes(expected) : typeof actual === 'string' && actual.includes(String(expected)),
  exists: (actual, expected) => (actual !== undefined) === Boolean(expected),
  greaterThan: (actual, expected) => typeof actual === 'number' && actual > expected,
  lessThan: (actual, expected) => typeof actual === 'number' && actual < expected
};

function validateCondition(condition) {
  assertConditionPath(condition);
  assertConditionValue(condition);
}

function assertConditionPath(condition) {
  const unsafe = String(condition?.attribute || '').split('.').some((part) => ['constructor', 'prototype', '__proto__'].includes(part));
  if (!condition || unsafe || !ATTRIBUTE_PATH.test(condition.attribute || '') || !OPERATORS.has(condition.operator)) throw new Error('Policy condition must use a supported attribute and operator.');
}

function assertConditionValue(condition) {
  if (condition.operator !== 'exists' && !Object.hasOwn(condition, 'value')) {
    throw new Error(`Condition '${condition.attribute}' requires a value.`);
  }
  if (['greaterThan', 'lessThan'].includes(condition.operator) && !Number.isFinite(condition.value)) {
    throw new Error(`Condition '${condition.attribute}' requires a finite numeric value.`);
  }
  if (condition.operator === 'in' && !Array.isArray(condition.value)) throw new Error(`Condition '${condition.attribute}' requires a list value.`);
  if (condition.operator === 'exists' && typeof condition.value !== 'boolean') throw new Error(`Condition '${condition.attribute}' requires a boolean value.`);
}

function validatePolicy(policy) {
  if (!policy || !['allow', 'deny'].includes(policy.effect)) throw new Error('Policy effect must be allow or deny.');
  if (!Array.isArray(policy.actions) || !policy.actions.length || policy.actions.some((action) => typeof action !== 'string' || !/^[A-Za-z0-9_:*.-]{1,128}$/.test(action))) {
    throw new Error('Policy actions must be a non-empty list of permission names.');
  }
  for (const condition of [...(policy.all || []), ...(policy.any || [])]) validateCondition(condition);
  validateSelector(policy.subjects, ['roles', 'ids', 'authMethods']);
  validateSelector(policy.resources, ['types', 'organizationIds', 'projectIds']);
  return { ...policy, enabled: policy.enabled !== false };
}

function validateSelector(selector, allowedFields) {
  if (selector === undefined) return;
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) throw new Error('Policy selectors must be objects.');
  for (const [field, values] of Object.entries(selector)) {
    if (!allowedFields.includes(field) || !Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
      throw new Error(`Unsupported policy selector '${field}'.`);
    }
  }
}

function readAttribute(context, path) {
  let value = context;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

function matchesCondition(condition, context) {
  const actual = readAttribute(context, condition.attribute);
  return CONDITION_MATCHERS[condition.operator](actual, condition.value);
}

function selectorMatches(selector, values) {
  return !selector || Object.entries(selector).every(([key, accepted]) => accepted.includes(values[key]));
}

function scopeMatches(policy, context) {
  if (policy.organizationId !== null && policy.organizationId !== (context.resource.organizationId || null)) return false;
  return policy.projectId === null || policy.projectId === (context.resource.projectId || null);
}

function actionMatches(policy, action) {
  return policy.actions.some((rule) => actionRuleMatches(rule, action));
}

function actionRuleMatches(rule, action) {
  if (rule === '*' || rule === action) return true;
  return rule.endsWith(':*') && action.startsWith(rule.slice(0, -1));
}

function conditionsMatch(policy, context) {
  const allMatch = (policy.all || []).every((condition) => matchesCondition(condition, context));
  const anyMatch = !(policy.any || []).length || policy.any.some((condition) => matchesCondition(condition, context));
  return allMatch && anyMatch;
}

function policyMatches(policy, context) {
  const principal = context.principal;
  const subject = { roles: principal.role, ids: principal.keyId || principal.username, authMethods: principal.authMethod || 'token' };
  const resource = { types: context.resource.type, organizationIds: context.resource.organizationId, projectIds: context.resource.projectId };
  return actionMatches(policy, context.action) && scopeMatches(policy, context)
    && selectorMatches(policy.subjects, subject) && selectorMatches(policy.resources, resource)
    && conditionsMatch(policy, context);
}

function evaluatePolicies(policies, context, fallbackAllowed) {
  const relevant = policies.filter((policy) => policy.enabled && actionMatches(policy, context.action) && scopeMatches(policy, context));
  if (!relevant.length) return { allowed: fallbackAllowed, source: 'rbac', effect: fallbackAllowed ? 'allow' : 'deny' };
  const matched = relevant.filter((policy) => policyMatches(policy, context));
  const denied = matched.some((policy) => policy.effect === 'deny');
  const allowed = !denied && matched.some((policy) => policy.effect === 'allow');
  return { allowed, source: 'policy', effect: denied ? 'deny' : allowed ? 'allow' : 'deny' };
}

async function authorize(input) {
  const db = input.db || await getDatabase();
  const organizationId = input.context.resource.organizationId || null;
  const projectId = input.context.resource.projectId || null;
  const rows = await db.all(
    `SELECT policy_json, organization_id, project_id FROM iam_policies WHERE enabled = 1
     AND (organization_id IS NULL OR organization_id = ?)
     AND (project_id IS NULL OR project_id = ?)`,
    organizationId, projectId
  );
  const policies = rows.map((row) => validatePolicy({ ...JSON.parse(row.policy_json), organizationId: row.organization_id, projectId: row.project_id }));
  const decision = evaluatePolicies(policies, input.context, input.fallbackAllowed);
  if (decision.source === 'policy') {
    require('./telemetryObserver').emitEvent({
      eventType: 'IAM_POLICY_EVALUATED',
      agentId: input.context.principal.keyId || input.context.principal.username || 'anonymous',
      action: input.context.action,
      detail: `Attribute policy decision: ${decision.effect}.`,
      severity: decision.allowed ? 'info' : 'warning',
      payload: { source: decision.source, effect: decision.effect, resourceType: input.context.resource.type }
    });
  }
  return decision;
}

module.exports = { validatePolicy, evaluatePolicies, authorize };
