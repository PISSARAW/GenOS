'use strict';

const crypto = require('node:crypto');
const store = require('../biomeSessionStore');
const persistence = require('../biomeSessionPersistence');
const { createEcologicalEvent } = require('../contracts/ecologicalEvent');
const queues = new Map();

function createOperationRunner(access) {
  return async context => {
    const previous = queues.get(context.sessionId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(() => execute(access, context));
    queues.set(context.sessionId, pending);
    try { return await pending; } finally {
      if (queues.get(context.sessionId) === pending) queues.delete(context.sessionId);
    }
  };
}

async function execute(access, context) {
  const options = context.options || {};
  if (options.db) return store.mutate({ db: options.db, id: context.sessionId,
    actorId: options.actorId, operation: context.operation,
    mutator: async record => change(persistence.rehydrate(record), context) });
  const current = await access.getSession(context.sessionId);
  const copied = persistence.rehydrate({ id: context.sessionId,
    revision: current.revision || 0, state: structuredClone(persistence.serialize(current)) });
  const updated = await change(copied, context);
  access.saveSession(copied);
  return structuredClone({ ...updated.result, revision: copied.revision });
}

async function change(session, context) {
  const options = context.options || {};
  const previousRevision = session.revision || 0;
  if (options.expectedRevision !== undefined && options.expectedRevision !== previousRevision) {
    throw Object.assign(new Error('Biome session changed since observation.'), { code: 'BIOME_SESSION_CONFLICT' });
  }
  const output = await context.apply(session);
  session.ecology.tick += 1;
  session.revision = previousRevision + 1;
  const receipt = receiptFor(session, context, { previousRevision, output });
  return { state: persistence.serialize(session), event: receipt,
    result: { sessionId: context.sessionId, ...output, receipt } };
}

function receiptFor(session, context, details) {
  const options = context.options || {};
  const { previousRevision, output } = details;
  return createEcologicalEvent({ operationId: crypto.randomUUID(),
    sessionId: context.sessionId, actorId: options.actorId || 'system',
    previousRevision, resultingRevision: session.revision, input: context.input,
    decision: output.decision || context.operation,
    appliedActions: output.actions || (output.action ? [output.action] : []),
    evidenceRefs: options.evidenceRefs || context.input.evidenceRefs || [],
    timestamp: new Date().toISOString() });
}

module.exports = { createOperationRunner };
