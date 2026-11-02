'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { createMessage } = require('../omegaProtocol/contract');
const context = require('./context');

async function authorize(session, input) {
  const frame = input.request || input.message || input;
  if (!await context.authorize(session.binding, frame)) return false;
  const expected = { actor: session.binding.actor, sender: session.binding.actor, audience: session.binding.actor,
    authority: session.binding.authority, generations: session.binding.generations, conversationId: session.conversationId,
    runId: session.runId };
  return Object.entries(expected).every(([key, value]) => !Object.hasOwn(frame, key) || digest(frame[key]) === digest(value));
}

function message(session, type, payload) {
  const id = digest([session.binding.runId, session.conversationId, type, session.messageSuffix || null]);
  const previous = session.previous;
  return createMessage({ messageId: id, idempotencyKey: id, operationId: session.conversationId,
    scope: session.binding.scope, missionId: session.binding.missionId, conversationId: session.conversationId,
    sender: session.binding.actor, audience: session.binding.actor, generations: session.binding.generations,
    authority: session.binding.authority, type, payload, causalRefs: previous ? [previous] : [],
    createdAt: session.createdAt, expiresAt: session.binding.expiresAt });
}

module.exports = { authorize, message };
