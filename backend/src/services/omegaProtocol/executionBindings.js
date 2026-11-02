'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const interop = require('../cognitiveOmegaInteropService');

function same(left, right) { return digest(left) === digest(right); }
function planQuery(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    planId: message.payload.planId, planDigest: message.payload.planDigest };
}

function validateAccepted(message, accepted) {
  if (accepted?.status !== 'accepted') throw new Error('OMEGA accepted plan required.');
  const expected = planQuery(message);
  const actual = { scope: accepted.context.scope, missionId: accepted.context.missionId,
    conversationId: accepted.context.conversationId, planId: accepted.plan.planId, planDigest: digest(accepted.plan) };
  if (!same(expected, actual)) throw new Error('OMEGA accepted plan scope or digest mismatch.');
  const actors = [message.sender, message.audience, message.generations, message.authority];
  if (!same(actors, [accepted.context.sender, accepted.context.audience, accepted.context.generations, accepted.context.authority])) {
    throw new Error('OMEGA actor, authority or generations mismatch.');
  }
  if (interop.digest(accepted.program) !== accepted.plan.programDigest) throw new Error('OMEGA accepted program digest mismatch.');
  const obligations = accepted.program.operations.map((operation) => ({ operationId: operation.id, kind: operation.kind,
    reference: operation.reference, dependsOn: operation.dependsOn, state: 'open' }));
  if (!same(obligations, accepted.plan.obligations)) throw new Error('OMEGA accepted obligations mismatch.');
  if (message.payload.baseDigest !== accepted.plan.baseDigest || message.payload.environmentDigest !== accepted.plan.environmentDigest) {
    throw new Error('OMEGA execution base or environment mismatch.');
  }
}

function binding(message, accepted) {
  return { ...planQuery(message), runId: message.payload.runId, plan: accepted.plan,
    programDigest: accepted.plan.programDigest, generations: accepted.context.generations,
    actor: accepted.context.sender, authority: accepted.context.authority };
}

function freshContext(accepted, current) {
  const expected = { baseDigest: accepted.plan.baseDigest, environmentDigest: accepted.plan.environmentDigest,
    generations: accepted.context.generations };
  if (!same(current, expected)) throw new Error('OMEGA execution context became stale.');
}

function policyAllows(program, operation) {
  const rule = program.policy[operation.kind.toLowerCase()];
  return rule === true || (Array.isArray(rule) && rule.includes(operation.reference));
}

function installedHandler(operation, handlers) {
  const installed = handlers.find((item) => item.kind === operation.kind && item.reference === operation.reference);
  if (!installed) throw new Error('OMEGA installed handler missing.');
  if (['READ', 'SELECT', 'CHECK'].includes(operation.kind) && installed.pure !== true) throw new Error('OMEGA pure handler guarantee required.');
  if (!['CALL', 'EMIT'].includes(operation.kind) && typeof installed.handle !== 'function') throw new Error('OMEGA executable handler missing.');
}

function capabilities(accepted, available, handlers) {
  if (digest(available) !== accepted.plan.capabilitiesDigest) throw new Error('OMEGA runtime capabilities changed.');
  for (const operation of accepted.program.operations) {
    if (!policyAllows(accepted.program, operation)) throw new Error('OMEGA original program policy denies operation.');
    const capability = available.operations.find((item) => item.kind === operation.kind);
    if (!capability?.references.includes(operation.reference)) throw new Error('OMEGA runtime capability missing.');
    installedHandler(operation, handlers);
  }
}

module.exports = { same, planQuery, validateAccepted, binding, freshContext, capabilities };
