'use strict';

const { ENGINE_VERSION } = require('./catalog');
const { digest } = require('./canonical');
const { validateInput, sameScope } = require('./validate');
const { baseChecks, actionChecks, delegationChecks } = require('./authority');
const { communication } = require('./communication');
const { verification } = require('./epistemics');
const { relationIds } = require('./graph');

function commonReasons(input) {
  const { context, request, authorization } = input;
  const checked = baseChecks(input);
  const reasons = checked.reasons;
  if (!sameScope(context.scope, request.scope)) reasons.push('SCOPE_MISMATCH');
  if (context.revision !== request.expectedRevision) reasons.push('RELATION_REVISION_CHANGED');
  if (request.at < context.asOf || request.at >= context.validUntil) reasons.push('SNAPSHOT_STALE');
  if (authorization?.requestHash !== digest(request)) reasons.push('AUTHORIZATION_REQUEST_MISMATCH');
  return { reasons, actor: checked.actor };
}
function specificDecision(input, actor) {
  switch (input.request.kind) {
    case 'communicate': return communication(input);
    case 'verify': return verification(input);
    case 'delegate': return { reasons: delegationChecks(input, actor), plan: { childId: input.request.childId, budget: input.request.budget } };
    case 'action': return { reasons: actionChecks(input, actor), plan: { action: input.request.action } };
    default: throw new Error('RPE_UNREACHABLE');
  }
}
function immutable(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
function seal(input, result) {
  const core = {
    engine: ENGINE_VERSION, operationId: input.request.operationId,
    scope: input.context.scope, revision: input.context.revision, at: input.request.at,
    permitted: result.reasons.length === 0,
    reasonCodes: [...new Set(result.reasons)].sort(),
    relationIds: relationIds(input.context, input.request.at),
    plan: result.plan || {}, inputHash: digest(input)
  };
  return immutable(structuredClone({ ...core, receiptHash: digest(core) }));
}
function evaluate(input) {
  validateInput(input);
  const base = commonReasons(input);
  if (base.reasons.length) return seal(input, { reasons: base.reasons });
  return seal(input, specificDecision(input, base.actor));
}
function replay(input, expected) {
  const actual = evaluate(input);
  return { matches: actual.receiptHash === expected.receiptHash, actual };
}

module.exports = { evaluate, replay, digest, ENGINE_VERSION };
