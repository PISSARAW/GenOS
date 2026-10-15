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
  if (request.name === 'genos_worker_publish') return result({ id: ++publicationId });
  if (request.arguments.acknowledge_message_ids) {
    return result({ messages: [], acknowledgement: { acknowledged: 1 } });
  }
  return result({ messages: [{ id: 21, senderAgentId: 'worker-c' }] });
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
  const publications = calls.filter((call) => call.name === 'genos_worker_publish');
  assert.equal(publications[0].arguments.recipient_agent_id, 'worker-b');
  assert.equal(Object.hasOwn(publications[1].arguments, 'recipient_agent_id'), false);
  assert.equal(publications[2].arguments.in_reply_to, 21);
  const acknowledgement = calls.find((call) => call.arguments.acknowledge_message_ids);
  assert.deepEqual(acknowledgement.arguments.acknowledge_message_ids, [21]);
  const prompt = appendCoordinationEvidence('mission', receipt);
  assert.match(prompt, /VERIFIED COORDINATION BOOTSTRAP/);
  assert.match(prompt, /"directMessageId": 11/);
}

main().then(() => console.log('Worker coordination bootstrap: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
