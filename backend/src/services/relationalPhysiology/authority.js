'use strict';

const { ACTIONS, READ_ONLY_ROLES, MUTATING_ACTIONS, DELEGATORS } = require('./catalog');
const { invalid, text, natural } = require('./validate');
const { activeRelations } = require('./graph');

function baseChecks(input) {
  const { context, request, authorization } = input;
  const reasons = [];
  if (authorization?.allowed !== true) reasons.push('BASE_AUTHORIZATION_DENIED');
  if (authorization?.operationId !== request.operationId) reasons.push('AUTHORIZATION_OPERATION_MISMATCH');
  if (authorization?.actorId !== request.actorId) reasons.push('AUTHORIZATION_ACTOR_MISMATCH');
  if (!Number.isSafeInteger(authorization?.validUntil) || request.at >= authorization.validUntil) reasons.push('AUTHORIZATION_EXPIRED');
  const actor = context.agents.find((agent) => agent.id === request.actorId);
  if (!actor) reasons.push('UNKNOWN_ACTOR');
  else if (actor.state !== 'active') reasons.push('ACTOR_INACTIVE');
  return { reasons, actor };
}

function hasLayers(layers, value) {
  return Array.isArray(layers) && layers.length > 0
    && layers.every((layer) => Array.isArray(layer) && layer.includes(value));
}
function actionChecks(input, actor) {
  const { request, authorization } = input;
  text(request.action, 'action');
  if (!ACTIONS.includes(request.action)) invalid('unknown.action');
  const reasons = [];
  if (!hasLayers(authorization.actionCeilings, request.action)) reasons.push('ACTION_OUTSIDE_CEILING');
  if (READ_ONLY_ROLES.includes(actor.role) && MUTATING_ACTIONS.includes(request.action)) reasons.push('OBSERVER_CANNOT_MUTATE');
  if (request.resource !== undefined && !hasLayers(authorization.resourceCeilings, request.resource)) reasons.push('RESOURCE_OUTSIDE_CEILING');
  if (request.action === 'promote') reasons.push(...promotionChecks(actor, authorization));
  if (['spawn', 'delegate'].includes(request.action) && !DELEGATORS.includes(actor.role)) reasons.push('ROLE_CANNOT_DELEGATE');
  reasons.push(...guardianChecks(input));
  return reasons;
}

function promotionChecks(actor, authorization) {
  const reasons = [];
  if (!['human', 'ontogenesis', 'orchestrator'].includes(actor.role)) reasons.push('ROLE_CANNOT_PROMOTE');
  if (authorization.evidenceGatePassed !== true) reasons.push('EVIDENCE_GATE_REQUIRED');
  return reasons;
}

function guardianChecks(input) {
  const { request, context, authorization } = input;
  // Only a rule admitted by the existing authority plane can require a signature.
  // An arbitrary 'guardian' edge cannot install a new veto or mint an approval.
  const rules = authorization.guardianRules || [];
  if (!Array.isArray(rules) || rules.length > 32) invalid('guardianRules');
  const edges = activeRelations(context, request.at);
  return rules.flatMap((rule) => guardianRule(rule, { input, edges }));
}
function guardianRule(rule, data) {
  const { input, edges } = data;
  const { request, authorization } = input;
  const edge = edges.find((relation) => relation.id === rule.relationId && relation.type === 'guardian'
    && relation.targetId === request.actorId);
  if (!edge) return ['REQUIRED_GUARDIAN_UNAVAILABLE'];
  const approval = (authorization.approvals || []).find((item) => item.signerId === edge.sourceId
    && approvalMatches(item, authorization, request));
  return approval ? [] : ['GUARDIAN_APPROVAL_REQUIRED'];
}

function approvalMatches(item, authorization, request) {
  return item.operationId === request.operationId && item.requestHash === authorization.requestHash
    && item.validated === true && Number.isSafeInteger(item.validUntil) && request.at < item.validUntil;
}
function invalidDelegate(child, actor) {
  return !child || child.id === actor.id || child.state !== 'active';
}
function delegationChecks(input, actor) {
  const { request, context, authorization } = input;
  const reasons = actionChecks({ ...input, request: { ...request, action: 'delegate' } }, actor);
  if (!DELEGATORS.includes(actor.role)) reasons.push('ROLE_CANNOT_DELEGATE');
  const child = context.agents.find((agent) => agent.id === request.childId);
  if (invalidDelegate(child, actor)) reasons.push('INVALID_DELEGATE');
  natural(request.depth, 'depth');
  natural(request.activeChildren, 'activeChildren');
  const limits = authorization.delegation;
  if (!limits || !Number.isSafeInteger(limits.maxDepth) || request.depth > limits.maxDepth) reasons.push('DEPTH_EXCEEDED');
  if (!limits || !Number.isSafeInteger(limits.maxChildren) || request.activeChildren >= limits.maxChildren) reasons.push('SPAWN_LIMIT_EXCEEDED');
  reasons.push(...budgetChecks(request.budget, limits?.remaining));
  return reasons;
}
function budgetChecks(requested, remaining) {
  if (!requested || typeof requested !== 'object') invalid('budget');
  const reasons = [];
  for (const key of ['tokens', 'milliseconds', 'microUsd']) {
    natural(requested[key], `budget.${key}`);
    if (!Number.isSafeInteger(remaining?.[key]) || requested[key] > remaining[key]) reasons.push(`BUDGET_EXCEEDED:${key}`);
  }
  return reasons;
}

module.exports = { baseChecks, actionChecks, delegationChecks, guardianChecks };
