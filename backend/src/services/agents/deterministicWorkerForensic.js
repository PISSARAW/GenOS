'use strict';

const { createHash } = require('node:crypto');

function forensicError(message) {
  return Object.assign(new Error(message), { code: 'WORKER_FORENSIC_INPUT_INVALID' });
}

function validEvent(event) {
  return typeof event?.id === 'string' && Boolean(event.id.trim()) && event.id.length <= 128
    && typeof event.sourceRef === 'string' && Boolean(event.sourceRef.trim())
    && event.sourceRef.length <= 256 && typeof event.occurredAt === 'string'
    && Number.isFinite(Date.parse(event.occurredAt))
    && (event.causedBy === undefined || validCause(event.causedBy));
}

function validCause(cause) {
  return typeof cause?.eventId === 'string' && Boolean(cause.eventId.trim()) && cause.eventId.length <= 128
    && typeof cause.receiptRef === 'string' && Boolean(cause.receiptRef.trim())
    && cause.receiptRef.length <= 256;
}

function assertForensicInput(methodContract) {
  const events = methodContract?.parameters?.events;
  if (!validMethod(methodContract, events)) {
    throw forensicError('Forensic tracing requires 2-1000 referenced, timestamped events.');
  }
  const seen = new Map();
  for (const event of events) {
    if (seen.has(event.id)) throw forensicError('Incident event identifiers must be unique.');
    const parent = seen.get(event.causedBy?.eventId);
    if (event.causedBy && (!parent || Date.parse(parent.occurredAt) > Date.parse(event.occurredAt))) {
      throw forensicError('Each declared cause must name an earlier event in the input.');
    }
    seen.set(event.id, event);
  }
  if (!events.some((event) => event.causedBy)) throw forensicError('No declared causal link was supplied.');
  return true;
}

function validMethod(methodContract, events) {
  return methodContract?.version === 1 && methodContract.methodId === 'trace_declared_causes'
    && Array.isArray(events) && events.length >= 2 && events.length <= 1000
    && events.every(validEvent);
}

function runForensic(methodContract) {
  assertForensicInput(methodContract);
  const events = methodContract.parameters.events;
  const byId = new Map(events.map((event) => [event.id, event]));
  const causalChain = events.filter((event) => event.causedBy).map((event) => {
    const parent = byId.get(event.causedBy.eventId);
    return { from: parent.id, to: event.id, relation: 'declared_cause',
      evidence: [parent.sourceRef, event.sourceRef, event.causedBy.receiptRef] };
  });
  const evidence = [...new Set(causalChain.flatMap((link) => link.evidence))];
  const unlinkedEvents = events.filter((event) => !event.causedBy).map((event) => event.id);
  const content = { causalChain, evidence, unlinkedEvents,
    interpretation: 'Links reproduce supplied causation receipts; independent causal truth is unverified.' };
  const digest = createHash('sha256').update(JSON.stringify({ methodContract, content })).digest('hex');
  return { ...content, forensicReceipt: { id: `solver://sha256:${digest}` } };
}

module.exports = { assertForensicInput, runForensic };
