'use strict';

const { createMessage } = require('./contract');
const { digest } = require('../evidenceProtocol/canonical');

function outbound(runtime, request) {
  const cause = request.message;
  const id = digest({ scope: cause.scope, missionId: cause.missionId, conversationId: cause.conversationId,
    type: request.type, cause: cause.messageId, actor: runtime.actor, payload: request.payload });
  const now = runtime.clock();
  const createdAt = new Date(typeof now === 'number' ? now : Date.parse(now)).toISOString();
  return createMessage({ messageId: id, operationId: cause.operationId, missionId: cause.missionId,
    conversationId: cause.conversationId, type: request.type, sender: runtime.actor, audience: cause.sender,
    scope: cause.scope, causalRefs: [cause.messageId],
    generations: { ...cause.generations, incarnation: runtime.incarnationGeneration }, authority: runtime.authority,
    idempotencyKey: id, createdAt, expiresAt: request.expiresAt, payload: request.payload }, { now });
}

module.exports = { outbound };
