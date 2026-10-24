'use strict';

const organization = require('../../../../backend/src/services/dynamicOrganizationService');
const relations = require('../../../../backend/src/services/crossAgentRelationalService');

function idsFor(seed) {
  if (typeof seed !== 'string' || !/^socialworld-v2-[a-zA-Z0-9_-]+$/.test(seed)) {
    throw new Error('V2-03 source seed is invalid.');
  }
  return { organizationId: `v203-source-${seed}`, projectId: `v203-project-${seed}`,
    workspaceId: `v203-workspace-${seed}`, rootId: `v203-${seed}-root`,
    senderId: `v203-${seed}-sender`, recipientId: `v203-${seed}-agent` };
}

async function createWorld(input) {
  const { db, ids } = input;
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', [ids.organizationId, 'SocialWorld V2-03 source']);
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)',
    [ids.projectId, ids.organizationId, 'SocialWorld V2-03 source']);
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    [ids.workspaceId, 'SocialWorld V2-03 source', ids.workspaceId, ids.organizationId, ids.projectId]);
  for (const [id, role, mode] of [[ids.rootId, 'orchestrator', 'orchestrator'],
    [ids.senderId, 'worker', 'worker'], [ids.recipientId, 'worker', 'worker']]) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id, parent_agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, id, role, 'idle', mode, ids.workspaceId, id === ids.rootId ? null : ids.rootId]);
  }
  await relations.createRelation({ db, id: `v203-relation-${input.seed}`, sourceAgentId: ids.senderId,
    targetAgentId: ids.recipientId, relationType: 'colleague', relationClass: 'organizational',
    organizationId: ids.organizationId, projectId: ids.projectId });
  await organization.changeOrganization(db, { orchestratorId: ids.rootId,
    organization: 'cross_functional_pod', reason: 'V2-03 sourced social exchange' });
}

async function publishObservedEvent(input) {
  const { db, ids, seed, index } = input;
  const eventId = `${seed}-source-event-${index}`;
  const sourceRef = `event:${eventId}`;
  const message = await organization.publish(db, { orchestratorId: ids.rootId,
    senderAgentId: ids.senderId, recipientAgentId: ids.recipientId,
    kind: 'evidence', signalType: 'ligand', signalData: { eventId, semanticRefs: [sourceRef] },
    payload: { sourceRef } });
  if (message.delivery !== 'delivered' || !(message.recipientAgentIds || []).includes(ids.recipientId)) {
    throw new Error(`V2-03 source event ${eventId} was not delivered.`);
  }
  const inbox = await organization.inbox(db, { orchestratorId: ids.rootId,
    requesterAgentId: ids.recipientId });
  const receipt = inbox.messages.find((item) => item.id === message.id && item.signal?.eventId === eventId);
  if (receipt?.integrity.status !== 'verified' || receipt.payload?.sourceRef !== sourceRef) {
    throw new Error(`V2-03 source event ${eventId} has no verified inbox receipt.`);
  }
  return { schemaVersion: 1, seed, eventId, actorId: ids.senderId, recipientId: ids.recipientId,
    domain: 'social_help', status: 'delivered',
    deliveryReceipt: { signalId: message.id, recipientAgentId: ids.recipientId,
      status: message.delivery, integrityStatus: receipt.integrity.status, sourceRef } };
}

async function verifyPersistedEvent(input) {
  const { db, ids, artifact } = input;
  const inbox = await organization.inbox(db, { orchestratorId: ids.rootId,
    requesterAgentId: ids.recipientId });
  const item = inbox.messages.find((entry) => entry.id === artifact.deliveryReceipt?.signalId);
  return artifactMatches(artifact, ids) && inboxMatches(item, artifact);
}

function artifactMatches(artifact, ids) {
  const expectedRef = `event:${artifact.eventId}`;
  return artifact.actorId === ids.senderId && artifact.recipientId === ids.recipientId
    && artifact.status === 'delivered' && artifact.deliveryReceipt?.status === 'delivered'
    && artifact.deliveryReceipt?.recipientAgentId === ids.recipientId
    && artifact.deliveryReceipt?.sourceRef === expectedRef;
}

function inboxMatches(item, artifact) {
  const expectedRef = `event:${artifact.eventId}`;
  return Boolean(item && item.signal?.eventId === artifact.eventId
    && item.integrity?.status === 'verified' && item.payload?.sourceRef === expectedRef
    && item.signal?.semanticRefs?.includes(expectedRef));
}

module.exports = { idsFor, createWorld, publishObservedEvent, verifyPersistedEvent };
