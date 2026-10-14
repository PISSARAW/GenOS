'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const organization = require('../src/services/dynamicOrganizationService');
const { getDatabase, closeDatabase } = require('../src/db');

async function createAgents(db) {
  await db.run("INSERT INTO organizations(id,name) VALUES ('receipt-org','Receipt Org')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES ('receipt-project','receipt-org','Receipt Project')");
  await db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES ('receipt-ws','Receipts','/receipt-test','receipt-org','receipt-project')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,workspace_id) VALUES ('receipt-root','Root','orchestrator','running','orchestrator','receipt-ws')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id,workspace_id) VALUES ('receipt-a','A','identity_witness','running','worker','receipt-root','receipt-ws')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id,workspace_id) VALUES ('receipt-b','B','peer_mapper','running','worker','receipt-root','receipt-ws')");
}

async function main() {
  process.env.GENOS_ADMIN_PASSWORD ||= 'organization-receipt-test-password';
  const dbPath = path.resolve(__dirname, `organization-receipts-${process.pid}.db`);
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await createAgents(db);
    await organization.changeOrganization(db, {
      orchestratorId: 'receipt-root', organization: 'cross_functional_pod',
      reason: 'continuous peer synchronization', changedBy: 'receipt-root'
    });
    const direct = await organization.publish(db, {
      orchestratorId: 'receipt-root', senderAgentId: 'receipt-a', recipientAgentId: 'receipt-b',
      kind: 'question', signalType: 'ligand', signalData: { topic: 'identity', request: 'declare_self' }
    });
    assert.deepEqual(direct.recipientAgentIds, ['receipt-b']);
    assert.deepEqual(direct.routing.recipients.map((recipient) => recipient.agentId), ['receipt-b']);
    assert.equal(direct.routing.routed, true);
    assert.equal((await organization.inbox(db, {
      orchestratorId: 'receipt-root', requesterAgentId: 'receipt-root'
    })).messages.length, 0, 'a direct peer message must not appear in the orchestrator inbox');
    const peerInbox = await organization.inbox(db, {
      orchestratorId: 'receipt-root', requesterAgentId: 'receipt-b'
    });
    assert.equal(peerInbox.messages[0].receiptState, 'read');
    assert.equal(peerInbox.messages[0].senderAgentId, 'receipt-a');
    const acknowledged = await organization.acknowledge(db, {
      orchestratorId: 'receipt-root', requesterAgentId: 'receipt-b', messageIds: [direct.id]
    });
    assert.equal(acknowledged.acknowledged, 1);
    assert.equal(acknowledged.receipts[0].receiptState, 'acknowledged');

    const broadcast = await organization.publish(db, {
      orchestratorId: 'receipt-root', senderAgentId: 'receipt-a', kind: 'evidence',
      signalType: 'ligand', signalData: { topic: 'identity', observation: 'peer_map_complete' }
    });
    assert.deepEqual(new Set(broadcast.recipientAgentIds), new Set(['receipt-root', 'receipt-b']));
    assert.deepEqual(new Set(broadcast.routing.recipients.map((recipient) => recipient.agentId)),
      new Set(['receipt-root', 'receipt-b']));
    const receipts = await db.all(
      'SELECT recipient_agent_id as recipientAgentId, state FROM agent_organization_message_receipts WHERE message_id = ? ORDER BY recipient_agent_id',
      broadcast.id
    );
    assert.deepEqual(receipts, [
      { recipientAgentId: 'receipt-b', state: 'available' },
      { recipientAgentId: 'receipt-root', state: 'available' }
    ]);
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

main().then(() => console.log('Organization delivery receipts: PASS'))
  .catch((failure) => { console.error(failure); process.exitCode = 1; });
