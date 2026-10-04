'use strict';

const { BLIND_TYPES, CONTROL_EVENTS, ACKS } = require('./catalog');
const { invalid, text, collection } = require('./validate');
const { activeRelations, between } = require('./graph');

const CONTENT_KINDS = Object.freeze(['problem', 'evidence', 'conclusion', 'plan', 'context', 'control']);
const BLIND_CONTENT = Object.freeze(['problem', 'evidence']);

function validateMessage(request) {
  text(request.receiverId, 'receiverId');
  collection(request.refs, 'refs', 256);
  for (const ref of request.refs) {
    text(ref.id, 'ref.id');
    text(ref.hash, 'ref.hash');
    if (!CONTENT_KINDS.includes(ref.kind)) invalid('ref.kind');
  }
  if (new Set(request.refs.map((ref) => ref.id)).size !== request.refs.length) invalid('refs.duplicate');
}
function knownReference(ref, input) {
  const { context, request } = input;
  return (context.groundings || []).some((entry) => entry.senderId === request.actorId
    && entry.receiverId === request.receiverId && entry.refId === ref.id && entry.hash === ref.hash
    && entry.validated === true && entry.observedAt <= request.at);
}
function ackLevel(input, edges, mandatory) {
  const requested = input.authorization.requiredAck || 'none';
  if (!ACKS.includes(requested)) invalid('requiredAck');
  let floor = mandatory ? 2 : 0;
  if (edges.some((edge) => ['client', 'supplier', 'guardian', 'reviewer', 'verifier'].includes(edge.type))) floor = Math.max(floor, 2);
  return ACKS[Math.max(floor, ACKS.indexOf(requested))];
}
function allowedReferences(refs, readableRefIds, blind) {
  return refs.filter((ref) => readableRefIds.includes(ref.id))
    .filter((ref) => !blind || BLIND_CONTENT.includes(ref.kind));
}
function communication(input) {
  const { context, request, authorization } = input;
  validateMessage(request);
  collection(authorization.recipientIds, 'recipientIds', 256);
  collection(authorization.readableRefIds, 'readableRefIds', 4096);
  const receiver = context.agents.find((agent) => agent.id === request.receiverId);
  const reasons = [];
  if (!receiver || receiver.state !== 'active') reasons.push('RECEIVER_UNAVAILABLE');
  if (!authorization.recipientIds?.includes(request.receiverId)) reasons.push('RECIPIENT_NOT_AUTHORIZED');
  const edges = between(activeRelations(context, request.at), [request.actorId, request.receiverId]);
  const blind = request.blind === true || edges.some((edge) => BLIND_TYPES.includes(edge.type));
  const mandatory = CONTROL_EVENTS.includes(request.event);
  const refs = allowedReferences(request.refs, authorization.readableRefIds, blind);
  const send = mandatory ? refs : refs.filter((ref) => !knownReference(ref, input));
  const redactedRefIds = request.refs.filter((ref) => !refs.includes(ref)).map((ref) => ref.id).sort();
  const deduplicatedRefIds = refs.filter((ref) => !send.includes(ref)).map((ref) => ref.id).sort();
  return {
    reasons,
    plan: {
      disposition: mandatory || send.length ? 'send' : 'silence',
      receiverId: request.receiverId,
      // Only references are emitted. The materializer MUST respect this allowlist.
      refs: send.map((ref) => ({ id: ref.id, hash: ref.hash, kind: ref.kind })).sort((a, b) => a.id < b.id ? -1 : Number(a.id > b.id)),
      event: mandatory ? request.event : 'information',
      redactedRefIds, deduplicatedRefIds, blind,
      requiredAck: ackLevel(input, edges, mandatory),
      encoding: 'typed_references'
    }
  };
}

module.exports = { communication };
