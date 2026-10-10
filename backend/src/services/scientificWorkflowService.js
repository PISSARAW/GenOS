'use strict';

const { withTransaction } = require('../db');
const references = require('./scientificReferences');
const propagation = require('./scientificPropagation');
const visibility = require('./cognitiveScientificReferenceVisibility');

async function ensureTables(db) {
  await references.ensureTables(db);
  await propagation.ensureTables(db);
}

function requireWorkflow(input) {
  if (!input?.db || !input.referenceStore) {
    throw new Error('Scientific workflow requires a database and trusted reference store.');
  }
  for (const name of ['publishVerified', 'markStale', 'markDerivedStale']) {
    if (typeof input.referenceStore[name] !== 'function') {
      throw new Error(`Scientific reference store is missing ${name}.`);
    }
  }
}

async function assertParticipantScope(db, ref, agentId) {
  const row = await db.get(`SELECT a.workspace_id, w.organization_id, w.project_id
    FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, agentId);
  if (!row || row.workspace_id !== ref.workspaceId ||
      row.organization_id !== ref.organizationId || row.project_id !== ref.projectId) {
    throw Object.assign(new Error('Scientific participant is outside reference scope.'),
      { code: 'SCI_REF_PARTICIPANT_SCOPE' });
  }
}

async function publishWithin(tx, store, input) {
  await assertParticipantScope(tx, input.reference, input.senderAgentId);
  if (input.consumerAgentId) {
    await assertParticipantScope(tx, input.reference, input.consumerAgentId);
  }
  const published = await store.publishVerified(tx, input);
  await propagation.registerDependencies(tx, {
    consumerRef: published.ref,
    dependencies: input.reference.dependencies || [],
    consumerAgentId: input.consumerAgentId || null,
  });
  const recipients = await propagation.consumersFor(tx, { ref: published.ref });
  await propagation.satisfyObligations(tx, {
    ref: published.ref, verificationReceiptId: published.receiptDigest,
  });
  const eventIds = await propagation.enqueueEvent(tx, {
    eventType: 'publish', ref: published.ref, recipients,
    payload: { uri: published.uri, contentDigest: published.digest,
      receiptDigest: published.receiptDigest, senderAgentId: input.senderAgentId },
  });
  return { ...published, recipients, eventIds };
}

async function retractWithin(tx, store, input) {
  const ref = typeof input.ref === 'string' ? references.parseReference(input.ref) : input.ref;
  await assertParticipantScope(tx, ref, input.senderAgentId);
  const recipients = await propagation.getDependentAgents(tx, ref);
  const source = await store.markStale(tx, input);
  await propagation.staleSubscriptions(tx, source.ref);
  const cascade = await propagation.invalidateDependents(tx, {
    ref: source.ref, reason: input.reason,
    retractionReceiptId: input.retractionReceiptId,
    retractionReceiptDigest: input.retractionReceiptDigest,
    senderAgentId: input.senderAgentId,
  });
  for (const affected of cascade.affectedRefs) {
    await store.markDerivedStale(tx, {
      ref: affected.ref, causalRef: affected.causalRef,
      retractionReceiptId: input.retractionReceiptId,
      retractionReceiptDigest: input.retractionReceiptDigest,
    });
  }
  const eventIds = await propagation.enqueueEvent(tx, {
    eventType: 'retract', ref: source.ref, recipients,
    idempotencyKey: input.retractionReceiptId,
    payload: { retractionReceiptId: input.retractionReceiptId,
      retractionReceiptDigest: input.retractionReceiptDigest, reason: input.reason,
      senderAgentId: input.senderAgentId },
  });
  const staleRefs = [source.ref, ...cascade.affectedRefs.map((item) => item.ref)];
  for (const staleRef of staleRefs) {
    await visibility.invalidateReference(tx, {
      uri: references.formatReference(staleRef), reason: 'scientific_retraction',
    });
  }
  return { ...source, affectedCount: cascade.affectedCount,
    eventIds: [...eventIds, ...cascade.eventIds] };
}

function createScientificWorkflow(options = {}) {
  requireWorkflow(options);
  const { db, referenceStore } = options;
  async function publishVerified(input) {
    if (typeof input?.senderAgentId !== 'string' || !input.senderAgentId.trim()) {
      throw new Error('Scientific workflow requires senderAgentId.');
    }
    await ensureTables(db);
    return withTransaction(db, (tx) => publishWithin(tx, referenceStore, input));
  }
  async function retract(input) {
    if (typeof input?.senderAgentId !== 'string' || !input.senderAgentId.trim()) {
      throw new Error('Scientific workflow requires senderAgentId.');
    }
    await ensureTables(db);
    return withTransaction(db, (tx) => retractWithin(tx, referenceStore, input));
  }
  async function subscribeReference(input) {
    if (typeof input?.consumerAgentId !== 'string' || !input.consumerAgentId.trim()) {
      throw new Error('Scientific subscription requires consumerAgentId.');
    }
    const ref = typeof input.ref === 'string' ? references.parseReference(input.ref) :
      references.parseReference(references.formatReference(input.ref));
    await ensureTables(db);
    return withTransaction(db, async (tx) => {
      await assertParticipantScope(tx, ref, input.consumerAgentId);
      return propagation.subscribeReference(tx, { ref, consumerAgentId: input.consumerAgentId });
    });
  }
  return Object.freeze({ publishVerified, retract, subscribeReference });
}

module.exports = { createScientificWorkflow };
