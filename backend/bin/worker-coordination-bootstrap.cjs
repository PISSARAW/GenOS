'use strict';

function decoded(result, toolName) {
  if (result?.isError) throw Object.assign(new Error(`${toolName} failed: ${result.content?.[0]?.text || 'unknown error'}`), {
    code: 'WORKER_COORDINATION_BOOTSTRAP_FAILED'
  });
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) throw Object.assign(new Error(`${toolName} returned no JSON evidence.`), {
    code: 'WORKER_COORDINATION_BOOTSTRAP_FAILED'
  });
  return JSON.parse(text);
}

async function invoke(callTool, name, args) {
  return decoded(await callTool({ name, arguments: args }), name);
}

function publicationArgs(input, recipientAgentId) {
  return {
    orchestrator_id: input.orchestratorId,
    ...(recipientAgentId ? { recipient_agent_id: recipientAgentId } : {}),
    kind: recipientAgentId ? 'question' : 'evidence', signal_type: 'ligand',
    signal_data: { event: recipientAgentId ? 'coordination_bootstrap_direct' : 'coordination_bootstrap_shared',
      protocol_version: 1, sender_agent_id: input.requesterId }
  };
}

async function waitForPeerMessage(input) {
  const deadline = Date.now() + input.maxWaitMs;
  do {
    const inbox = await invoke(input.callTool, 'genos_worker_inbox', {
      orchestrator_id: input.orchestratorId, limit: 100
    });
    const messages = (inbox.messages || []).filter((message) => message.senderAgentId !== input.requesterId);
    if (messages.length) return { ...inbox, messages };
    await new Promise((resolve) => setTimeout(resolve, input.pollMs));
  } while (Date.now() < deadline);
  throw Object.assign(new Error('No peer message arrived during the coordination bootstrap window.'), {
    code: 'WORKER_COORDINATION_BOOTSTRAP_TIMEOUT'
  });
}

async function bootstrapCoordination(input) {
  const state = await invoke(input.callTool, 'genos_organization_state', {
    orchestrator_id: input.orchestratorId
  });
  const requesterId = state.requester?.id;
  const peers = (state.communicationLinks || []).filter((link) => link.relationship === 'peer');
  if (!requesterId || !peers.length) throw Object.assign(new Error('Organization state has no requester or peer link.'), {
    code: 'WORKER_COORDINATION_BOOTSTRAP_INVALID_STATE'
  });
  const context = { ...input, requesterId };
  const direct = await invoke(input.callTool, 'genos_worker_publish', publicationArgs(context, peers[0].agentId));
  const shared = await invoke(input.callTool, 'genos_worker_publish', publicationArgs(context));
  const inbox = await waitForPeerMessage({ ...context, maxWaitMs: input.maxWaitMs ?? 30000,
    pollMs: input.pollMs ?? 500 });
  const receivedIds = inbox.messages.map((message) => message.id);
  const acknowledgement = await invoke(input.callTool, 'genos_worker_inbox', {
    orchestrator_id: input.orchestratorId, after_id: inbox.messages.at(-1).id,
    acknowledge_message_ids: receivedIds
  });
  const reply = await invoke(input.callTool, 'genos_worker_publish', {
    ...publicationArgs(context, inbox.messages[0].senderAgentId), kind: 'answer',
    in_reply_to: inbox.messages[0].id,
    signal_data: { event: 'coordination_bootstrap_reply', protocol_version: 1,
      sender_agent_id: requesterId, acknowledged_message_ids: receivedIds }
  });
  return { state, directMessageId: direct.id, sharedMessageId: shared.id,
    receivedMessageIds: receivedIds, acknowledged: acknowledgement.acknowledgement,
    replyMessageId: reply.id, inReplyTo: inbox.messages[0].id };
}

module.exports = { bootstrapCoordination };
