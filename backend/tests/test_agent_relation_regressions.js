'use strict';

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const organization = require('../src/services/dynamicOrganizationService');
const relations = require('../src/services/crossAgentRelationalService');
const learning = require('../src/services/communication/communicationLearningService');
const profiles = require('../src/services/communication/relationshipCommunicationProfileService');
const routing = require('../src/services/communication/relationshipCommunicationRoutingService');
const { getDatabase, closeDatabase } = require('../src/db');

let db;
let sequence = 0;
const root = 'relfix-root';
const sender = 'relfix-a';
const receiver = 'relfix-b';
const scope = { organizationId: 'relfix-org', projectId: 'relfix-p1' };

before(async () => {
  process.env.GENOS_ADMIN_PASSWORD ||= 'relation-regression-test-only';
  db = await getDatabase(':memory:');
  await db.run("INSERT INTO organizations(id,name) VALUES ('relfix-org','Relations')");
  for (const project of ['relfix-p1', 'relfix-p2']) {
    await db.run("INSERT INTO projects(id,organization_id,name) VALUES (?,'relfix-org',?)", project, project);
  }
  await db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES ('relfix-ws','Relations','/memory-only','relfix-org','relfix-p1')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,workspace_id) VALUES (?,'Coordinator','orchestrator','running','orchestrator','relfix-ws')", root);
  for (const id of [sender, receiver, 'relfix-c']) await addWorker(id);
});

after(async () => closeDatabase());

async function addWorker(id) {
  await db.run("INSERT INTO agents(id,name,name_meaning,role,status,execution_mode,parent_agent_id,workspace_id) VALUES (?,?,'identifying meaning','reviewer','running','worker',?,'relfix-ws')", id, id, root);
}

function change(organizationName) {
  return organization.changeOrganization(db, { orchestratorId: root, organization: organizationName });
}

function publish(options = {}) {
  return organization.publish(db, { orchestratorId: root, senderAgentId: sender,
    recipientAgentId: receiver, kind: 'question', signalType: 'ligand',
    signalData: { question: 'inspect this artifact', nonce: ++sequence }, ...options });
}

async function messages(agentId, afterId = 0) {
  return (await organization.inbox(db, { orchestratorId: root, requesterAgentId: agentId, afterId })).messages;
}

test('anonymous inbox removes identifying metadata and raw representations without rewriting evidence', async () => {
  await change('blind_adversarial_review');
  const sent = await publish();
  const message = (await messages(receiver, sent.id - 1))[0];
  assert.equal(message.senderAgentId, 'anonymous_worker');
  assert.equal(message.integrity.status, 'verified');
  assert.equal(message.signal.question, 'inspect this artifact');
  assert.equal(JSON.stringify(message).includes(sender), false);
  assert.equal(message.payloadJson, undefined);
  assert.equal(message.signalBlob, undefined);
  const stored = await db.get('SELECT sender_agent_id, payload_json FROM agent_organization_messages WHERE id = ?', sent.id);
  assert.equal(stored.sender_agent_id, sender);
  assert.ok(stored.payload_json.includes(sender));
});

test('leaving silence preserves a direct audience and envelope integrity', async () => {
  await change('network_silence');
  const sent = await publish();
  assert.equal(sent.delivery, 'buffered');
  assert.equal((await messages(receiver, sent.id - 1)).some((message) => message.id === sent.id), false);
  assert.equal((await db.all('SELECT * FROM agent_organization_message_receipts WHERE message_id = ?', sent.id)).length, 0);
  await change('cross_functional_pod');
  const received = (await messages(receiver, sent.id - 1)).find((message) => message.id === sent.id);
  assert.ok(received);
  assert.equal(received.integrity.status, 'verified');
  assert.equal(received.recipientAgentId, receiver);
  assert.equal((await messages('relfix-c', sent.id - 1)).some((message) => message.id === sent.id), false);
  assert.equal((await messages(root, sent.id - 1)).some((message) => message.id === sent.id), false);
});

test('a buffered broadcast does not acquire members recruited after publication', async () => {
  await change('network_silence');
  const sent = await publish({ recipientAgentId: null });
  await addWorker('relfix-late');
  await change('cross_functional_pod');
  assert.ok((await messages(receiver, sent.id - 1)).some((message) => message.id === sent.id));
  assert.equal((await messages('relfix-late', sent.id - 1)).some((message) => message.id === sent.id), false);
});

test('unread messages survive transitions with their original visibility and receipt', async () => {
  await change('blind_adversarial_review');
  const sent = await publish();
  await change('cross_functional_pod');
  const received = (await messages(receiver, sent.id - 1)).find((message) => message.id === sent.id);
  assert.ok(received);
  assert.equal(received.senderAgentId, 'anonymous_worker');
  assert.equal(received.receiptState, 'read');
  assert.equal(JSON.stringify(received).includes(sender), false);
  const ack = await organization.acknowledge(db, { orchestratorId: root,
    requesterAgentId: receiver, messageIds: [sent.id] });
  assert.equal(ack.receipts[0].receiptState, 'acknowledged');
  await db.run("UPDATE workspaces SET project_id = 'relfix-p2' WHERE id = 'relfix-ws'");
  try {
    assert.equal((await messages(receiver, sent.id - 1)).some((message) => message.id === sent.id), false);
  } finally {
    await db.run("UPDATE workspaces SET project_id = 'relfix-p1' WHERE id = 'relfix-ws'");
  }
});

test('legacy buffered messages retain exact targets and never reconstruct a broadcast audience', async () => {
  await change('network_silence');
  const direct = await publish();
  const broadcast = await publish({ recipientAgentId: null });
  await db.run('DELETE FROM agent_organization_message_audiences WHERE message_id IN (?, ?)', direct.id, broadcast.id);
  await change('specialist_expert_committee');
  assert.ok((await messages(receiver, direct.id - 1)).some((message) => message.id === direct.id));
  assert.equal((await messages(root, direct.id - 1)).some((message) => message.id === direct.id), false);
  assert.equal((await db.get('SELECT delivery FROM agent_organization_messages WHERE id = ?', broadcast.id)).delivery, 'buffered');
});

test('publication rolls back the message if its audience cannot be persisted', async () => {
  await change('cross_functional_pod');
  const before = await db.get('SELECT COUNT(*) AS count FROM agent_organization_messages');
  await db.exec("CREATE TEMP TRIGGER refuse_audience BEFORE INSERT ON agent_organization_message_audiences BEGIN SELECT RAISE(ABORT, 'audit audience unavailable'); END");
  try { await assert.rejects(publish(), /audit audience unavailable/); }
  finally { await db.exec('DROP TRIGGER refuse_audience'); }
  assert.deepEqual(await db.get('SELECT COUNT(*) AS count FROM agent_organization_messages'), before);
});

test('relation learning updates only the exact organization and project including reverse edges', async () => {
  for (const [id, projectId, organizationId] of [
    ['learn-p1', scope.projectId, scope.organizationId],
    ['learn-p2', 'relfix-p2', scope.organizationId],
    ['learn-other', scope.projectId, 'other-org'], ['learn-null', null, null]
  ]) {
    await relations.createRelation({ db, id, sourceAgentId: receiver, targetAgentId: sender,
      relationType: 'friend', organizationId, projectId });
  }
  await learning.learnFromOutcome({ db, ...scope, senderId: sender, receiverId: receiver, actionTaken: true });
  const rows = await db.all("SELECT id, familiarity, interaction_count FROM agent_relations WHERE id LIKE 'learn-%' ORDER BY id");
  for (const row of rows) {
    assert.equal(row.interaction_count, row.id === 'learn-p1' ? 13 : 12);
    assert.equal(row.familiarity, row.id === 'learn-p1' ? 0.75 : 0.7);
  }
  await learning.learnFromOutcome({ db, senderId: sender, receiverId: receiver, actionTaken: true });
  const scoped = await db.get("SELECT interaction_count FROM agent_relations WHERE id = 'learn-p1'");
  const unscoped = await db.get("SELECT interaction_count FROM agent_relations WHERE id = 'learn-null'");
  assert.equal(scoped.interaction_count, 13);
  assert.equal(unscoped.interaction_count, 13);
  await relations.createRelation({ db, ...scope, id: 'learn-same-scope',
    sourceAgentId: sender, targetAgentId: receiver, relationType: 'friend' });
  await learning.learnFromOutcome({ db, ...scope, relationId: 'learn-p1',
    senderId: sender, receiverId: receiver, actionTaken: true });
  assert.equal((await db.get("SELECT interaction_count FROM agent_relations WHERE id = 'learn-same-scope'")).interaction_count, 12);
  assert.equal((await db.get("SELECT interaction_count FROM agent_relations WHERE id = 'learn-p1'")).interaction_count, 14);
});

test('unknown relationships remain unknown and cannot satisfy an independence request', async () => {
  const input = { db, ...scope, fromAgentId: sender, toAgentId: 'relfix-c' };
  const profile = await profiles.deriveProfile(input);
  assert.equal(profile.epistemicIndependence, null);
  assert.equal(profile.errorCorrelation, null);
  const request = { db, ...scope, candidates: [{ agentId: 'relfix-c' }],
    intent: { senderAgentId: sender, risk: 'low', independenceRequired: true, independenceThreshold: 0 } };
  assert.deepEqual(await routing.profileAudience(request), []);
  request.intent.independenceRequired = false;
  assert.equal((await routing.profileAudience(request)).length, 1);
});

test('relation metadata rejects invalid classes and nonfinite or out-of-range measurements before writing', async () => {
  const invalid = [
    { relationClass: 'invalid-class' }, { relationClass: 'lineage' },
    { epistemicIndependence: 7 }, { disclosureLevel: 9 }, { authority: -1 },
    { familiarity: NaN }, { errorCorrelation: Infinity }, { sharedHistory: '0.5' },
    { interactionCount: -1 }, { trustByDomain: { code: 2 } }, null, [], 'invalid-object'
  ];
  const before = await db.get('SELECT COUNT(*) AS count FROM agent_relations');
  for (const metadata of invalid) {
    await assert.rejects(relations.createRelation({ db, ...scope, sourceAgentId: sender,
      targetAgentId: receiver, relationType: 'friend', metadata }));
  }
  await assert.rejects(relations.createRelation({ db, ...scope, sourceAgentId: sender,
    targetAgentId: receiver, relationType: 'friend', relationClass: 'social',
    metadata: { relationClass: 'lineage' } }));
  assert.deepEqual(await db.get('SELECT COUNT(*) AS count FROM agent_relations'), before);
  const valid = await relations.createRelation({ db, ...scope, sourceAgentId: sender,
    targetAgentId: receiver, relationType: 'partner', metadata: {
      relationClass: 'social', epistemicIndependence: 0, disclosureLevel: 1,
      trustByDomain: { code: 0.8 }, topic: 'retained extension' } });
  assert.equal(valid.relationClass, 'social');
  assert.equal(valid.metadata.topic, 'retained extension');
});
