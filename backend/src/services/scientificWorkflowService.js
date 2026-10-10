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

async function publishWithin(tx, store, input) {
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
  const recipients = await propagation.getDependentAgents(tx, ref);
  const source = await store.markStale(tx, input);
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
  return Object.freeze({ publishVerified, retract });
}

module.exports = { createScientificWorkflow };
