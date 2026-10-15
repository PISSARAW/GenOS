'use strict';

const assert = require('node:assert/strict');
const { bootstrapCoordination } = require('../bin/worker-coordination-bootstrap.cjs');
const { appendCoordinationEvidence } = require('../bin/agent-runtime-prompt.cjs');

const calls = [];
let publicationId = 10;
async function callTool(request) {
  calls.push(request);
  if (request.name === 'genos_organization_state') return result({
    organization: 'cross_functional_pod', version: 1,
    requester: { id: 'worker-a', role: 'identity_witness' },
    members: [{ id: 'worker-a' }, { id: 'worker-b' }, { id: 'worker-c' }],
    communicationLinks: [{ agentId: 'worker-b', relationship: 'peer' },
      { agentId: 'worker-c', relationship: 'peer' }]
  });
  if (request.name === 'genos_worker_publish') return result({
    id: ++publicationId,
    organization: 'cross_functional_pod', version: 1,
    channel: request.arguments.recipient_agent_id ? 'direct' : 'shared',
    delivery: 'delivered', recipientAgentId: request.arguments.recipient_agent_id || null,
    recipientAgentIds: request.arguments.recipient_agent_id ? [request.arguments.recipient_agent_id] : ['worker-b', 'worker-c'],
    kind: request.arguments.kind, signalType: request.arguments.signal_type
  });
  if (request.arguments.acknowledge_message_ids) {
    return result({ messages: [], acknowledgement: { acknowledged: 1,
      receipts: [{ messageId: 21, receiptState: 'acknowledged' }] } });
  }
  return result({ messages: [{ id: 21, senderAgentId: 'worker-c', recipientAgentId: null,
    kind: 'evidence', signalType: 'ligand', signal: { event: 'coordination_bootstrap_shared' },
    receiptState: 'read' }] });
}

function result(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

async function main() {
  const receipt = await bootstrapCoordination({ callTool, orchestratorId: 'root', maxWaitMs: 10 });
  assert.equal(receipt.directMessageId, 11);
  assert.equal(receipt.sharedMessageId, 12);
  assert.equal(receipt.replyMessageId, 13);
  assert.equal(receipt.inReplyTo, 21);
  assert.equal(receipt.directMessage.senderAgentId, 'worker-a');
  assert.equal(receipt.directMessage.recipientAgentId, 'worker-b');
  assert.equal(receipt.sharedMessage.recipientAgentId, null);
  assert.deepEqual(receipt.sharedMessage.recipientAgentIds, ['worker-b', 'worker-c']);
  assert.equal(receipt.receivedMessages[0].senderAgentId, 'worker-c');
  assert.equal(receipt.receivedMessages[0].receiptState, 'read');
  assert.equal(receipt.acknowledgement.receipts[0].receiptState, 'acknowledged');
  assert.equal(receipt.replyMessage.inReplyTo, 21);
  assert.deepEqual(receipt.replyMessage.signal.acknowledged_message_ids, [21]);
  const publications = calls.filter((call) => call.name === 'genos_worker_publish');
  assert.equal(publications[0].arguments.recipient_agent_id, 'worker-b');
  assert.equal(Object.hasOwn(publications[1].arguments, 'recipient_agent_id'), false);
  assert.equal(publications[2].arguments.in_reply_to, 21);
  const acknowledgement = calls.find((call) => call.arguments.acknowledge_message_ids);
  assert.deepEqual(acknowledgement.arguments.acknowledge_message_ids, [21]);
  const prompt = appendCoordinationEvidence('mission', receipt);
  assert.match(prompt, /VERIFIED COORDINATION BOOTSTRAP/);
  assert.match(prompt, /satisfies the mandatory coordination calls; do not repeat them/);
  assert.match(prompt, /return outcome success/);
  assert.match(prompt, /"directMessageId": 11/);
  assert.match(prompt, /"senderAgentId": "worker-c"/);
  assert.match(prompt, /"receiptState": "acknowledged"/);
  assert.match(prompt, /"inReplyTo": 21/);
}

main().then(() => console.log('Worker coordination bootstrap: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
