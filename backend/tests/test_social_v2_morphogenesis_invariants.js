'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v2-morphogenesis-test-only';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const organization = require('../src/services/dynamicOrganizationService');
const relations = require('../src/services/crossAgentRelationalService');
const runtime = require('../src/services/agentRuntimeAdapter');

const SCOPE = { organizationId: 'social-v2-morph-org', projectId: 'social-v2-morph-project' };
const MEMBERS = ['social-v2-root', 'social-v2-a', 'social-v2-b'];

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('social-v2-morph-org', 'SocialWorld V2')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('social-v2-morph-project', 'social-v2-morph-org', 'SocialWorld V2')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('social-v2-morph-space', 'SocialWorld V2', 'social-v2-morph', 'social-v2-morph-org', 'social-v2-morph-project')");
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES ('social-v2-root', 'Root', 'orchestrator', 'running', 'orchestrator', 'social-v2-morph-space')");
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES ('social-v2-a', 'A', 'worker', 'idle', 'worker', 'social-v2-morph-space', 'social-v2-root')");
  await db.run("INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES ('social-v2-b', 'B', 'worker', 'idle', 'worker', 'social-v2-morph-space', 'social-v2-root')");
  await relations.createRelation({ db, id: 'social-v2-friendship', sourceAgentId: 'social-v2-a',
    targetAgentId: 'social-v2-b', relationType: 'friend', relationClass: 'social', ...SCOPE });
}

async function publishEvidence(db, input) {
  return organization.publish(db, { orchestratorId: 'social-v2-root', senderAgentId: input.senderAgentId,
    recipientAgentId: input.recipientAgentId, kind: 'evidence', signalType: 'ligand',
    signalData: { event: input.event, semanticRefs: [`fact:${input.event}`] },
    payload: { sourceRef: `fact:${input.event}` } });
}

async function assertMembershipAndRelation(db) {
  const memberState = await organization.getStateForMember(db, 'social-v2-root', 'social-v2-a');
  assert.deepEqual(new Set(memberState.members.map((member) => member.id)), new Set(MEMBERS));
  const friendship = await relations.getRelation({ db, id: 'social-v2-friendship' });
  assert.equal(friendship.relationType, 'friend');
  assert.equal(friendship.sourceAgentId, 'social-v2-a');
  assert.equal(friendship.targetAgentId, 'social-v2-b');
}

async function assertEvidenceReceipt(db, requesterAgentId, expectedEvent) {
  const inbox = await organization.inbox(db, { orchestratorId: 'social-v2-root', requesterAgentId });
  const message = inbox.messages.find((entry) => entry.signal?.event === expectedEvent);
  assert.ok(message, JSON.stringify(inbox.messages));
  assert.equal(message.integrity.status, 'verified');
  assert.ok(message.signal.semanticRefs.includes(`fact:${expectedEvent}`));
}

async function exerciseTransitions(db) {
  const first = await organization.changeOrganization(db, { orchestratorId: 'social-v2-root',
    organization: 'specialist_expert_committee', reason: 'share verified route evidence' });
  assert.equal(first.version, 1);
  const firstMessage = await publishEvidence(db,
    { senderAgentId: 'social-v2-a', recipientAgentId: 'social-v2-b', event: 'map-v1' });
  assert.equal(firstMessage.delivery, 'delivered');
  await assertEvidenceReceipt(db, 'social-v2-root', 'map-v1');
  await assertMembershipAndRelation(db);

  const second = await organization.changeOrganization(db, { orchestratorId: 'social-v2-root',
    organization: 'red_blue_coevolution', reason: 'review the route evidence independently' });
  assert.equal(second.version, 2);
  const secondMessage = await publishEvidence(db,
    { senderAgentId: 'social-v2-b', recipientAgentId: 'social-v2-a', event: 'map-review-v2' });
  assert.equal(secondMessage.delivery, 'delivered');
  await assertEvidenceReceipt(db, 'social-v2-a', 'map-review-v2');
  await assertMembershipAndRelation(db);
}

async function assertTransitionGuards(db) {
  await assert.rejects(() => organization.changeOrganization(db, { orchestratorId: 'social-v2-root',
    organization: 'stigmergy', changedBy: 'social-v2-a' }),
  (error) => error.code === 'ORCHESTRATOR_AUTHORITY_REQUIRED');
  const transitions = await db.all('SELECT version, from_organization, to_organization FROM agent_organization_transitions WHERE orchestrator_id = ? ORDER BY version',
    'social-v2-root');
  assert.equal(transitions.length, 2);
  assert.equal(runtime.workerToolLease('worker').includes('genos_change_organization'), false);
}

async function main() {
  const db = await getDatabase(':memory:');
  try {
    await createWorld(db);
    await exerciseTransitions(db);
    await assertTransitionGuards(db);
    console.log('SocialWorld V2 preserved identity, relations, permissions and evidence across two topology transitions.');
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
